import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Repository } from "redis-om";

import { Client, Entity, Schema } from "redis-om";

/* our entity */
class AssetGroup extends Entity {}

/* create a Schema for AssetGroup */
const assetGroupSchema = new Schema(AssetGroup, {
  assetId: { type: "string" },
  authority: { type: "string" },
  pubkeys: { type: "string[]" },
  data: { type: "string" },
  //   lastUpdated: { type: "date" },
});

export class GIndexer {
  program: anchor.Program;
  programId: PublicKey;
  client: Client;
  agRepo: Repository<AssetGroup>;

  constructor(
    program: anchor.Program,
    client: Client,
    assetGroupRepository: Repository<AssetGroup>
  ) {
    this.program = program;
    this.programId = program.programId;
    this.client = client;
    this.agRepo = assetGroupRepository;
  }

  static async fromClient(program: anchor.Program, client: Client) {
    /* use the client to create a Repository just for Persons */
    const agRepo = client.fetchRepository(assetGroupSchema);

    /* create the index for Person */
    await agRepo.createIndex();
    return new GIndexer(program, client, agRepo);
  }

  async fetchAssetsForAuthority(authority: PublicKey) {
    return await this.agRepo
      .search()
      .where("authority")
      .equals(authority.toBase58())
      .returnAll();
  }

  async fetchAsset(assetId: PublicKey) {
    return await this.agRepo
      .search()
      .where("assetId")
      .equals(assetId.toBase58())
      .returnFirst();
  }

  async handleTransaction(tx: anchor.web3.TransactionResponse) {
    let cpiEvents = parseCpiEvents(tx, this.program);

    for (const event of cpiEvents) {
      this.handleCpiEvent(event);
    }
  }

  async handleCpiEvent(event: anchor.Event) {
    if (event.name === "CudCreate") {
      await this.handleCUDCreate(event);
    } else if (event.name === "CudUpdate") {
      console.log("Processing an update");
      await this.handleCUDUpdate(event);
    } else if (event.name === "CudDelete") {
      await this.handleCUDDelete(event);
    }
  }

  private async handleCUDCreate(event: anchor.Event) {
    const data = event.data as CudCreate;
    this.agRepo.createAndSave(jsonifyAssetGroup(data));
  }
  private async handleCUDUpdate(event: anchor.Event) {
    console.log("Processing update", event.data.authority.toString());
    await this.deleteAsset((event.data as CudUpdate).assetId);
    await this.handleCUDCreate(event);
  }
  private async handleCUDDelete(event: anchor.Event) {
    const data = event.data as CudDelete;
    await this.deleteAsset(data.assetId);
  }
  private async deleteAsset(assetId: PublicKey) {
    let entityId = await this.agRepo
      .search()
      .where("assetId")
      .equals(assetId.toString())
      .returnFirstId();

    if (entityId.length === 0) {
      throw new Error("Could not find entity to delete");
    }

    console.log("When deleting, successfully found entity id: ", entityId);
    await this.agRepo.remove(entityId);
  }

  async clearAll() {
    await this.agRepo.remove(
      (await this.agRepo.search().all()).map((a) => a.entityId)
    );
  }
}

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
    return await this.gIndexer.agRepo
      .search()
      .where("pubkeys")
      .contains(collection.toBase58())
      .and("assetId")
      .not.equals(collection.toBase58())
      .returnAll();
  }
}

type IAssetGroup = {
  assetId: PublicKey;
  authority: PublicKey;
  pubkeys: PublicKey[];
  data: Buffer;
};
type CudCreate = IAssetGroup;
type CudUpdate = CudCreate;
type CudDelete = {
  assetId: PublicKey;
};

function jsonifyAssetGroup(data: IAssetGroup) {
  return {
    assetId: data.assetId.toString(),
    authority: data.authority.toString(),
    pubkeys: data.pubkeys.map((key) => key.toString()),
    data: anchor.utils.bytes.base64.encode(data.data),
  };
}

export async function createGIndexer(program: anchor.Program) {
  /* pulls the Redis URL from .env */
  const url = process.env.REDIS_URL;

  /* create and open the Redis OM Client */
  const client = await new Client().open(url);
  return GIndexer.fromClient(program, client);
}

type UniversalIx = {
  programId: anchor.web3.PublicKey;
  keys: anchor.web3.PublicKey[];
  data: Buffer;
};

function orderInstructions(tx: anchor.web3.TransactionResponse): UniversalIx[] {
  let accounts: anchor.web3.PublicKey[] =
    tx.transaction.message.staticAccountKeys;
  accounts = accounts.concat(tx.meta.loadedAddresses.writable ?? []);
  accounts = accounts.concat(tx.meta.loadedAddresses.readonly ?? []);

  let ordered: UniversalIx[] = [];

  let outerIdx = 0;
  let innerIdx = 0;
  for (const outerIxFlat of tx.transaction.message.instructions) {
    let outerIx: UniversalIx = {
      programId: accounts[outerIxFlat.programIdIndex],
      keys: outerIxFlat.accounts.map((idx) => accounts[idx]),
      data: anchor.utils.bytes.bs58.decode(outerIxFlat.data),
    };
    ordered.push(outerIx);

    const innerIxBucket = tx.meta?.innerInstructions[innerIdx];
    if (innerIxBucket && innerIxBucket.index === outerIdx) {
      for (const innerIxFlat of innerIxBucket.instructions) {
        let innerIx: UniversalIx = {
          programId: accounts[innerIxFlat.programIdIndex],
          keys: innerIxFlat.accounts.map((idx) => accounts[idx]),
          data: anchor.utils.bytes.bs58.decode(innerIxFlat.data),
        };
        ordered.push(innerIx);
      }
      innerIdx += 1;
    }
    outerIdx += 1;
  }
  return ordered;
}

const CPI_EVENT_IX: Buffer = Buffer.from([
  0xe4, 0x45, 0xa5, 0x2e, 0x51, 0xcb, 0x9a, 0x1d,
]);

// Parses CPI events from a transaction for the given anchor program
function parseCpiEvents(
  tx: anchor.web3.TransactionResponse,
  program: anchor.Program
): anchor.Event[] {
  let orderedIxs = orderInstructions(tx);
  // console.log(orderedIxs);

  let events: anchor.Event[] = [];
  for (let i = 1; i < orderedIxs.length; i += 1) {
    const ix = orderedIxs[i];

    if (ix.data.slice(0, 8).equals(CPI_EVENT_IX)) {
      const eventAuthority = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("__event_authority")],
        program.programId
      )[0];

      // CHECK that the event authority is the CPI authority
      if (
        ix.keys.length != 1 ||
        ix.keys[0].toBase58() !== eventAuthority.toBase58()
      ) {
        continue;
      }

      const eventData = anchor.utils.bytes.base64.encode(ix.data.slice(8));
      const event = program.coder.events.decode(eventData);
      events.push(event);
    }
  }

  return events;
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

// async function interpretEvents(
//   events: anchor.Event[],
//   program: anchor.Program<CrudIndexing>
// ) {
//   for (const event of events) {
//     if (event.name == "CrudCreate" || event.name == "CrudUpdate") {
//       let authority: PublicKey = event.data.authority as any;
//       let assetId: PublicKey = event.data.assetId as any;
//       let pubkeys: PublicKey[] = event.data.pubkeys as any;
//       let ix_data: Buffer = event.data.data as any;

//       let ix = await program.methods
//         .getAssetData(ix_data)
//         .accounts({ assetId, authority })
//         .remainingAccounts(
//           pubkeys.map((key) => {
//             return {
//               isSigner: false,
//               isWritable: false,
//               pubkey: key,
//             };
//           })
//         )
//         .instruction();
//       const mv0 = anchor.web3.MessageV0.compile({
//         instructions: [ix],
//         payerKey: program.provider.publicKey!,
//         recentBlockhash: (
//           await program.provider.connection.getLatestBlockhash()
//         ).blockhash,
//       });
//       const vtx = new anchor.web3.VersionedTransaction(mv0);

//       let simulationResult = await program.provider
//         .simulate(vtx, [], "confirmed")
//         .catch((err) => console.error(err));
//       if (!simulationResult) {
//         continue;
//       }

//       let returnData = simulationResult.returnData;
//       if (returnData) {
//         let returnDataLog =
//           simulationResult.logs[simulationResult.logs.length - 2];
//         let subjects = returnDataLog.split(" ");

//         let programId = subjects[2];
//         let retData = subjects[3];

//         if (programId !== program.programId.toBase58()) {
//           throw new Error("Program ID mismatch in return data");
//         }

//         let data = anchor.utils.bytes.base64.decode(retData);
//         console.log(
//           `${event.name.replace("Crud", "")}-d asset for ${
//             event.data.authority
//           }: ${data.toString("utf-8")} (${event.data.assetId})})`
//         );
//       }
//     } else if (event.name == "CrudDelete") {
//       console.log(
//         `Deleted asset for ${event.data.authority}: ${event.data.assetId}`
//       );
//     }
//   }
// }
