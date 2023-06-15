import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { NftStyleOne } from "../target/types/nft_style_one";
import { assert } from "chai";

import { createAARTransfer } from "./nftInstruction";

describe("nft-style-one.unit", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.NftStyleOne as Program<NftStyleOne>;

  let collectionKp = anchor.web3.Keypair.generate();
  let collection = collectionKp.publicKey;
  let metadata = anchor.web3.PublicKey.findProgramAddressSync(
    [
      collection.toBuffer(),
      Buffer.from("metadata"),
      Buffer.from(new anchor.BN(0).toArray("le", 4)),
    ],
    program.programId
  )[0];

  beforeEach(async () => {
    await program.methods
      .initCollection(10000)
      .accounts({
        owner: program.provider.publicKey,
        collection,
      })
      .signers([collectionKp])
      .rpc({ commitment: "confirmed" });
    await program.methods
      .mint(0, "name", "symbol", "uri")
      .accounts({
        owner: program.provider.publicKey,
        asset: metadata,
        collection,
      })
      .rpc({ commitment: "confirmed" });
  });
  // TODO: Add tests for other AAR instructions
  //   it("AAR /mint", async () => {});
  it("AAR /transfer", async () => {
    let randomDestinationKp = anchor.web3.Keypair.generate();
    let randomDestination = randomDestinationKp.publicKey;

    let transferAccounts = {
      owner: program.provider.publicKey,
      asset: metadata,
      authority: program.provider.publicKey,
      destination: randomDestination,
    };
    let transferIx = await createAARTransfer(program, transferAccounts);

    let tx = new anchor.web3.Transaction();
    tx.add(transferIx);
    await program.provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
  });
});
