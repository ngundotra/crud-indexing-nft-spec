import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { NftStyleOne } from "../target/types/nft_style_one";
import { GIndexer, createGIndexer } from "./gindexerPg";
import { NFTRpc } from "./nftRpc";
import { assert } from "chai";

describe("crud-indexing", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.NftStyleOne as Program<NftStyleOne>;

  let collectionKp = anchor.web3.Keypair.generate();
  let collection = collectionKp.publicKey;

  let gIndexer: GIndexer;
  let nftRpc: NFTRpc;

  it("Can initialize indexer", async () => {
    gIndexer = await createGIndexer(program);
    await gIndexer.clearAll();
    nftRpc = new NFTRpc(gIndexer);
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
    let collections = await nftRpc.fetchCollections();
    assert(collections.length === 1, "Should have 1 collection");
    assert(
      collections[0].assetId === collection.toBase58(),
      "Should have correct collection id ${collections[0]}"
    );
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

    // Test parsing
    let collectionAssets = await nftRpc.fetchNFTsinCollection(collection);

    assert(collectionAssets.length === 1, "Collection should have 1 asset");
    let asset = collectionAssets[0];

    assert(asset.pubkeys.length >= 3, "NFT Asset must have 3 pubkeys minimum");
    assert(
      asset.pubkeys[0] === collection.toBase58(),
      "NFT Asset must have collection as first key"
    );
    assert(
      asset.pubkeys[1] === program.provider.publicKey.toBase58(),
      "NFT Asset must have delegate as second key"
    );
    assert(
      asset.pubkeys[2] === asset.assetId,
      `NFT Asset must have assetId as 3rd key ${asset.pubkeys[2]} vs expected ${asset.assetId}`
    );

    let nft = await nftRpc.fetchNFT(new anchor.web3.PublicKey(asset.assetId));
    assert(nft, "NFT must exist");
    assert(nft["name"] === "name", "NFT must have correct name");
    assert(nft["uri"] === "uri", "NFT must have correct uri");
    assert(nft["symbol"] === "symbol", "NFT must have correct symbol");
  });
  it("Can transfer an NFT", async () => {
    let randomDestination = anchor.web3.Keypair.generate().publicKey;
    const tx = await program.methods
      .transfer(0)
      .accounts({
        owner: program.provider.publicKey,
        dest: randomDestination,
        collection,
      })
      .rpc({ commitment: "confirmed" });

    const txResult = await program.provider.connection.getTransaction(tx, {
      commitment: "confirmed",
    });

    await gIndexer.handleTransaction(txResult);

    // Test parsing
    // Collection should still only have 1 asset
    let collectionAssets = await nftRpc.fetchNFTsinCollection(collection);
    assert(
      collectionAssets.length === 1,
      "Collection should still only have 1 asset"
    );

    let testWalletAssets = await nftRpc.fetchNFTsForAuthority(
      program.provider.publicKey
    );
    assert(testWalletAssets.length === 0, "Test wallet should have 0 assets");

    let destAssets = await nftRpc.fetchNFTsForAuthority(randomDestination);
    assert(destAssets.length === 1, "Destination wallet should have 1 assets");

    let asset = destAssets[0];
    assert(asset.pubkeys.length >= 3, "NFT Asset must have 3 pubkeys minimum");
    assert(
      asset.pubkeys[1] === randomDestination.toBase58(),
      "Transferring an NFT Asset must update the delegate as the second key (in this case we set it to dest)"
    );
  });
  after(async () => {
    console.log("Closing db connection");
    await gIndexer.teardown();
  });
});
