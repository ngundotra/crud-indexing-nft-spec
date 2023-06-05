import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import { GIndexer, IAssetGroup } from "./gIndexer";

export class NFTRpc {
  gIndexer: GIndexer;
  constructor(gIndexer: GIndexer) {
    this.gIndexer = gIndexer;
  }

  async fetchNFT(assetId: PublicKey) {
    let assetGroup = await this.gIndexer.agRepo
      .search()
      .where("assetId")
      .equals(assetId.toBase58())
      .returnFirst();
    let renderedAsset = assetGroup.toJSON();
    let iasset: IAssetGroup = {
      assetId: new PublicKey(renderedAsset.assetId),
      authority: new PublicKey(renderedAsset.authority),
      pubkeys: renderedAsset.pubkeys.map((key) => new PublicKey(key)),
      data: anchor.utils.bytes.base64.decode(renderedAsset.data),
    };

    return await getAssetData(iasset as IAssetGroup, this.gIndexer.program);
  }

  async fetchNFTsForAuthority(authority: PublicKey) {
    return await this.gIndexer.agRepo
      .search()
      .where("authority")
      .equals(authority.toBase58())
      .and("pubkeys")
      .contains(authority.toBase58())
      .returnAll();
  }

  /**
   * Returns all NFT Asset Groups in a collection
   * Without the collection itself (if it has its own AssetId)
   * @param collection
   * @returns
   */
  async fetchNFTsinCollection(collection: PublicKey) {
    // Ideally we'd search that **only** the first key is the collection
    return await this.gIndexer.agRepo
      .search()
      .where("pubkeys")
      .contains(collection.toBase58())
      .and("assetId")
      .not.equals(collection.toBase58())
      .returnAll();
  }
}

export async function getAssetData(
  assetGroup: IAssetGroup,
  program: anchor.Program
): Promise<Object> {
  let ix = await program.methods
    .getAssetData(assetGroup.data)
    .accounts({ assetId: assetGroup.assetId, authority: assetGroup.authority })
    .remainingAccounts(
      assetGroup.pubkeys.map((key) => {
        return {
          isSigner: false,
          isWritable: false,
          pubkey: key,
        };
      })
    )
    .instruction();
  const mv0 = anchor.web3.MessageV0.compile({
    instructions: [ix],
    payerKey: program.provider.publicKey!,
    recentBlockhash: (await program.provider.connection.getLatestBlockhash())
      .blockhash,
  });
  const vtx = new anchor.web3.VersionedTransaction(mv0);

  let simulationResult = await program.provider
    .simulate(vtx, [], "confirmed")
    .catch((err) => console.error(err));

  if (!simulationResult) {
    throw new Error("Unable to simulate transaction");
  }

  let returnData = simulationResult.returnData;
  if (returnData) {
    let returnDataLog = simulationResult.logs[simulationResult.logs.length - 2];
    let subjects = returnDataLog.split(" ");

    let programId = subjects[2];
    let retData = subjects[3];

    if (programId !== program.programId.toBase58()) {
      throw new Error("Program ID mismatch in return data");
    }

    let data = anchor.utils.bytes.base64.decode(retData);
    return JSON.parse(data.toString("utf-8"));
  }
  return {};
}
