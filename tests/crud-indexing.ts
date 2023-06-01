import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CrudIndexing } from "../target/types/crud_indexing";
import { TransactionInstruction } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";

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

async function interpretEvents(
  events: anchor.Event[],
  program: anchor.Program<CrudIndexing>
) {
  for (const event of events) {
    if (event.name == "CrudCreate" || event.name == "CrudUpdate") {
      let assetId: PublicKey = event.data.assetId as any;
      let pubkeys: PublicKey[] = event.data.pubkeys as any;
      let ix_data: Buffer = event.data.data as any;

      let ix = await program.methods
        .getAssetData(ix_data)
        .accounts({ assetId })
        .remainingAccounts(
          pubkeys.map((key) => {
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
        recentBlockhash: (
          await program.provider.connection.getLatestBlockhash()
        ).blockhash,
      });
      const vtx = new anchor.web3.VersionedTransaction(mv0);

      let simulationResult = await program.provider
        .simulate(vtx, [], "confirmed")
        .catch((err) => console.error(err));
      if (!simulationResult) {
        continue;
      }

      let returnData = simulationResult.returnData;
      if (returnData) {
        let returnDataLog =
          simulationResult.logs[simulationResult.logs.length - 2];
        let subjects = returnDataLog.split(" ");

        let programId = subjects[2];
        let retData = subjects[3];

        if (programId !== program.programId.toBase58()) {
          throw new Error("Program ID mismatch in return data");
        }

        let data = anchor.utils.bytes.base64.decode(retData);
        console.log(
          `${event.name.replace("Crud", "")}-d asset for ${
            event.data.authority
          }: ${data.toString("utf-8")} (${event.data.assetId})})`
        );
      }
    } else if (event.name == "CrudDelete") {
      console.log(
        `Deleted asset for ${event.data.authority}: ${event.data.assetId}`
      );
    }
  }
}

describe("crud-indexing", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.CrudIndexing as Program<CrudIndexing>;

  let collectionKp = anchor.web3.Keypair.generate();
  let collection = collectionKp.publicKey;

  it("Can create a collection", async () => {
    const tx = await program.methods
      .initCollection(10000)
      .accounts({
        owner: program.provider.publicKey,
        collection,
      })
      .signers([collectionKp])
      .rpc({ commitment: "confirmed" });

    const txResult = await program.provider.connection.getTransaction(tx, {
      commitment: "confirmed",
    });

    let events = parseCpiEvents(txResult, program);
    await interpretEvents(events, program);
  });
  it("Can mint an NFT", async () => {
    const tx = await program.methods
      .mint(0, "name", "symbol", "uri")
      .accounts({
        owner: program.provider.publicKey,
        collection,
      })
      .rpc({ commitment: "confirmed" });

    const txResult = await program.provider.connection.getTransaction(tx, {
      commitment: "confirmed",
    });

    let events = parseCpiEvents(txResult, program);
    await interpretEvents(events, program);
  });
  it("Can transfer an NFT", async () => {
    const tx = await program.methods
      .transfer(0)
      .accounts({
        owner: program.provider.publicKey,
        dest: anchor.web3.Keypair.generate().publicKey,
        collection,
      })
      .rpc({ commitment: "confirmed" });

    const txResult = await program.provider.connection.getTransaction(tx, {
      commitment: "confirmed",
    });

    // let events = parseCpiEvents(txResult, program);
    // console.log(events);

    let events = parseCpiEvents(txResult, program);
    await interpretEvents(events, program);
  });
});
