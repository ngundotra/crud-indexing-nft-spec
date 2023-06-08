import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import { AssetGroup, GIndexer, IAssetGroup, PGAsset } from "./gindexerPg";

function pgAssetToAssetGroup(pgAsset: PGAsset): AssetGroup {
  return {
    assetId: pgAsset.asset_id,
    authority: pgAsset.authority,
    pubkeys: pgAsset.pubkeys,
    data: pgAsset.data,
  };
}

export class NFTRpc {
  gIndexer: GIndexer;
  constructor(gIndexer: GIndexer) {
    this.gIndexer = gIndexer;
  }

  async fetchCollections(): Promise<AssetGroup[]> {
    let query = `SELECT * FROM program_assets
      WHERE program_id = $1
      AND SUBSTRING(data FROM 1 FOR 8) = $2;`;
    let values = [
      this.gIndexer.programId.toBase58(),
      getCollectionDiscriminator(),
    ];
    let collections = await this.gIndexer.client.query(query, values);
    return (collections.rows as PGAsset[]).map(pgAssetToAssetGroup);
  }

  async fetchNFT(assetId: PublicKey) {
    let asset = pgAssetToAssetGroup(await this.gIndexer.fetchAsset(assetId));
    let renderedAsset = asset as any;
    let iasset: IAssetGroup = {
      assetId: new PublicKey(renderedAsset.assetId),
      authority: new PublicKey(renderedAsset.authority),
      pubkeys: renderedAsset.pubkeys.map((key) => new PublicKey(key)),
      data: renderedAsset.data,
    };

    return await getAssetData(iasset as IAssetGroup, this.gIndexer.program);
  }

  async fetchNFTsForAuthority(authority: PublicKey): Promise<AssetGroup[]> {
    let selectAssetGroupQuery = `SELECT * FROM program_assets WHERE 
      program_id = $1 AND authority = $2 AND SUBSTRING(data FROM 1 FOR 8) = $3;`;
    let values = [
      this.gIndexer.programId.toBase58(),
      authority.toBase58(),
      getMetadataDiscriminator(),
    ];
    let results = await this.gIndexer.client.query(
      selectAssetGroupQuery,
      values
    );
    return (results.rows as PGAsset[]).map(pgAssetToAssetGroup);
  }

  /**
   * Returns all NFT Asset Groups in a collection
   * Without the collection itself (if it has its own AssetId)
   * @param collection
   * @returns
   */
  async fetchNFTsinCollection(collection: PublicKey): Promise<AssetGroup[]> {
    // Collections are defined by a discriminator in the data
    let selectAssetGroupQuery = `SELECT * FROM program_assets 
      WHERE COALESCE(pubkeys[1], '') = $1 
      AND SUBSTRING(data FROM 1 FOR 8) = $2;`;
    let values = [collection.toBase58(), getMetadataDiscriminator()];
    let result = await this.gIndexer.client.query(
      selectAssetGroupQuery,
      values
    );

    return (result.rows as PGAsset[]).map(pgAssetToAssetGroup);
  }
}

const COLLECTION_DISC = Buffer.from(
  anchor.utils.sha256.hash("srfc19:collection"),
  "hex"
).slice(0, 8);
function getCollectionDiscriminator() {
  return COLLECTION_DISC;
}

const METADATA_DISC = Buffer.from(
  anchor.utils.sha256.hash("srfc19:metadata"),
  "hex"
).slice(0, 8);
function getMetadataDiscriminator() {
  return METADATA_DISC;
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
