import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CrudIndexing } from "../target/types/crud_indexing";
import { GIndexer, createGIndexer } from "./gIndexer";

describe("crud-indexing", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.CrudIndexing as Program<CrudIndexing>;

  let collectionKp = anchor.web3.Keypair.generate();
  let collection = collectionKp.publicKey;

  let gIndexer: GIndexer;

  it("Can initialize indexer", async () => {
    gIndexer = await createGIndexer(program);
    console.log("Made gindexer", gIndexer);
  });
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

    await gIndexer.handleTransaction(txResult);

    // let events = parseCpiEvents(txResult, program);
    // await interpretEvents(events, program);
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

    await gIndexer.handleTransaction(txResult);
    let results = await gIndexer.agRepo
      .search()
      .where("pubkeys")
      .contains(collection.toBase58())
      .return.all();
    console.log("Results: ", results);
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

    await gIndexer.handleTransaction(txResult);
  });
});
