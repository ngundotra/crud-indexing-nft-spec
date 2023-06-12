import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { NftStyleOne } from "../target/types/nft_style_one";
import { Marketplace } from "../target/types/marketplace";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { additionalAccountsRequest } from "./additionalAccountsRequest";

describe("marketplace.e2e", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const marketplace = anchor.workspace.Marketplace as Program<Marketplace>;
  const nftProgram = anchor.workspace.NftStyleOne as Program<NftStyleOne>;

  let provider = marketplace.provider;

  describe("NFT Style One", () => {
    let collectionKp = anchor.web3.Keypair.generate();
    let collection = collectionKp.publicKey;
    let metadata = PublicKey.findProgramAddressSync(
      [
        collection.toBuffer(),
        Buffer.from("metadata"),
        Buffer.from(new anchor.BN(0).toArray("le", 4)),
      ],
      nftProgram.programId
    )[0];

    let listingPrice = new anchor.BN(10000);

    before(async () => {
      await nftProgram.methods
        .initCollection(10000)
        .accounts({
          owner: provider.publicKey!,
          collection,
        })
        .signers([collectionKp])
        .rpc({ commitment: "confirmed" });

      await nftProgram.methods
        .mint(0, "hello", "MOM", "www.google.com")
        .accounts({
          owner: provider.publicKey!,
          asset: metadata,
          collection,
        })
        .rpc({ commitment: "confirmed" });
    });

    it("Can list an NFT", async () => {
      let ix = await marketplace.methods
        .list(listingPrice)
        .accounts({
          assetOwner: provider.publicKey!,
          asset: metadata,
          authority: provider.publicKey!,
          nftProgram: nftProgram.programId,
          fundRecipient: provider.publicKey!,
        })
        .instruction();

      ix = await additionalAccountsRequest(marketplace, ix, "list");

      let tx = new anchor.web3.Transaction();
      tx.add(ix);

      await provider.sendAndConfirm(tx, [], {
        commitment: "confirmed",
        skipPreflight: true,
      });
    });
    it("Can buy an NFT", async () => {
      let randomBuyerKp = anchor.web3.Keypair.generate();
      let randomBuyer = randomBuyerKp.publicKey;

      await provider.connection.requestAirdrop(
        randomBuyer,
        5 * LAMPORTS_PER_SOL
      );

      let ix = await marketplace.methods
        .buyListing()
        .accounts({
          assetOwner: provider.publicKey!,
          asset: metadata,
          buyer: randomBuyer,
          marketplaceListing: PublicKey.findProgramAddressSync(
            [
              Buffer.from("listing"),
              Buffer.from(listingPrice.toArray("le", 8)),
            ],
            marketplace.programId
          )[0],
          nftProgram: nftProgram.programId,
          fundRecipient: provider.publicKey!,
        })
        .signers([randomBuyerKp])
        .instruction();

      ix = await additionalAccountsRequest(marketplace, ix, "buy_listing");

      let tx = new anchor.web3.Transaction();
      tx.add(ix);
      await provider.sendAndConfirm(tx, [randomBuyerKp], {
        commitment: "confirmed",
        skipPreflight: true,
      });
    });
  });
});
