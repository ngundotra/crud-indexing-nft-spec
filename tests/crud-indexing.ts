import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CrudIndexing } from "../target/types/crud_indexing";
import { TransactionInstruction } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";

  return events;
}

async function interpretEvents(
  events: anchor.Event[],
  program: anchor.Program<CrudIndexing>
) {
  for (const event of events) {
    if (event.name == "CrudCreate" || event.name == "CrudUpdate") {
      let authority: PublicKey = event.data.authority as any;
      let assetId: PublicKey = event.data.assetId as any;
      let pubkeys: PublicKey[] = event.data.pubkeys as any;
      let ix_data: Buffer = event.data.data as any;

      let ix = await program.methods
        .getAssetData(ix_data)
        .accounts({ assetId, authority })
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
