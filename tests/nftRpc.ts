import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import { AssetGroup, GIndexerPg, IAssetGroup } from "./gIndexerPg";
import { sha256 } from "@coral-xyz/anchor/dist/cjs/utils";

export class NFTRpc {
  gIndexer: GIndexerPg;
  constructor(gIndexer: GIndexerPg) {
    this.gIndexer = gIndexer;
  }

  async fetchNFT(assetId: PublicKey) {
    let asset = this.gIndexer.fetchAsset(assetId);
    // let assetGroup = await this.gIndexer.agRepo
    //   .search()
    //   .where("assetId")
    //   .equals(assetId.toBase58())
    //   .returnFirst();
    // let renderedAsset = assetGroup.toJSON();
    let renderedAsset = asset as any;
    let iasset: IAssetGroup = {
      assetId: new PublicKey(renderedAsset.assetId),
      authority: new PublicKey(renderedAsset.authority),
      pubkeys: renderedAsset.pubkeys.map((key) => new PublicKey(key)),
      data: anchor.utils.bytes.base64.decode(renderedAsset.data),
    };

    return await getAssetData(iasset as IAssetGroup, this.gIndexer.program);
  }

  async fetchNFTsForAuthority(authority: PublicKey): Promise<AssetGroup[]> {
    // return await this.gIndexer.agRepo
    //   .search()
    //   .where("authority")
    //   .equals(authority.toBase58())
    //   .and("pubkeys")
    //   .contains(authority.toBase58())
    //   .returnAll();

    // TODO: fix
    let selectAssetGroupQuery = `SELECT * FROM program_assets WHERE pubkeys @> ARRAY[$1]`;
    let results = await this.gIndexer.client.query(selectAssetGroupQuery);
    return results.rows as AssetGroup[];
  }

  /**
   * Returns all NFT Asset Groups in a collection
   * Without the collection itself (if it has its own AssetId)
   * @param collection
   * @returns
   */
  async fetchNFTsinCollection(collection: PublicKey): Promise<AssetGroup[]> {
    // Collections are defined by
    let selectAssetGroupQuery = `SELECT * FROM program_assets WHERE COALESCE(pubkeys[1], '') = $1 and data[1:8] = $2;`;
    let values = [collection.toBase58(), getCollectionDiscriminator()];
    let result = await this.gIndexer.client.query(
      selectAssetGroupQuery,
      values
    );
    console.log("Fetched collection:", result);

    return result.rows as AssetGroup[];
  }
}

function getCollectionDiscriminator() {
  let disc = Buffer.from(
    anchor.utils.sha256.hash("srfc19:collection"),
    "hex"
  ).slice(0, 8);
  console.log("collection disc", disc);
  return disc;
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
