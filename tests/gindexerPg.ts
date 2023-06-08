import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Client } from "pg";

export interface AssetGroup {
  assetId: string;
  authority: string;
  pubkeys: string[];
  data: Buffer;
}

export type PGAsset = {
  program_id: string;
  asset_id: string;
  authority: string;
  pubkeys: string[];
  data: Buffer;
};

/**
 * Postgres-backed General Asset Indexer
 */
export class GIndexer {
  program: anchor.Program;
  programId: PublicKey;
  client: Client;

  constructor(program: anchor.Program) {
    this.program = program;
    this.programId = program.programId;
    this.client = new Client({
      user: "postgres",
      host: "localhost",
      database: "postgres",
      password: "your_password",
      port: 5469,
    });
    this.client.connect();
  }

  async setupTable() {
    let initQuery = `CREATE TABLE IF NOT EXISTS program_assets (
      program_id VARCHAR(255) NOT NULL,
      asset_id VARCHAR(255) NOT NULL,
      authority VARCHAR(255) NOT NULL,
      pubkeys VARCHAR(255)[],
      data BYTEA,
      last_updated TIMESTAMP,
      PRIMARY KEY (program_id, asset_id)
    );`;

    await this.client.query(initQuery, (err, res) => {
      if (err) {
        console.error(err);
      }
    });
  }

  async fetchAssetsForAuthority(authority: PublicKey) {
    let query = `SELECT * from program_assets WHERE authority = $1 and program_id = $2`;
    let values = [authority.toBase58(), this.programId.toBase58()];
    let results = await this.client.query(query, values);
    return results;
  }

  async fetchAsset(assetId: PublicKey): Promise<PGAsset> {
    let query = `SELECT * from program_assets WHERE program_id = $1 and asset_id = $2`;
    let values = [this.programId.toBase58(), assetId.toBase58()];
    let results = await this.client.query(query, values);
    return results.rows[0] as PGAsset;
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
    this.upsertAsset(jsonifyAssetGroup(data));
  }
  private async handleCUDUpdate(event: anchor.Event) {
    const data = event.data as CudCreate;
    await this.upsertAsset(jsonifyAssetGroup(data)); // JSON ?
  }
  private async handleCUDDelete(event: anchor.Event) {
    const data = event.data as CudDelete;
    await this.deleteAsset(data.assetId.toBase58());
  }
  async upsertAsset(assetGroup: AssetGroup) {
    const upsertAssetGroupQuery = `
      INSERT INTO program_assets(program_id, asset_id, authority, pubkeys, data, last_updated)
      VALUES($1, $2, $3, $4, $5, $6)
      ON CONFLICT (program_id, asset_id) DO UPDATE
      SET authority = EXCLUDED.authority,
          pubkeys = EXCLUDED.pubkeys,
          data = EXCLUDED.data,
          last_updated = EXCLUDED.last_updated;
    `;
    const values = [
      this.programId.toBase58(),
      assetGroup.assetId,
      assetGroup.authority,
      assetGroup.pubkeys,
      assetGroup.data,
      new Date(),
    ];
    await this.client.query(upsertAssetGroupQuery, values, (err, res) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log("Asset group is successfully upserted");
    });
  }
  private async deleteAsset(assetId: string) {
    const deleteAssetGroupQuery = `
      DELETE FROM program_assets
      WHERE program_id = $1 AND asset_id = $2;
    `;
    const values = [this.programId.toBase58(), assetId];
    await this.client.query(deleteAssetGroupQuery, values, (err, res) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log("Asset group is successfully deleted");
    });
  }

  async clearAll() {
    await this.client.query(`TRUNCATE program_assets;`, (err, res) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log("Table is successfully truncated");
    });
  }
  async teardown() {
    await this.client.query(`DROP TABLE program_assets;`, (err, res) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log("Table is successfully dropped");
    });
    this.client.end();
  }
}

export type IAssetGroup = {
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
    data: data.data,
  };
}

export async function createGIndexer(program: anchor.Program) {
  let gIndexer = new GIndexer(program);
  await gIndexer.setupTable();
  return gIndexer;
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
