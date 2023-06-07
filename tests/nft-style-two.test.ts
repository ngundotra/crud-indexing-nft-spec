import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { NftStyleTwo } from "../target/types/nft_style_two";
import { GIndexer, createGIndexer } from "./gIndexer";
import { NFTRpc } from "./nftRpc";
import { assert } from "chai";

describe.skip("nft-style-two", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.NftStyleTwo as Program<NftStyleTwo>;

  let collectionKp = anchor.web3.Keypair.generate();
  let collection = collectionKp.publicKey;
  let editionMetadataKp = anchor.web3.Keypair.generate();
  let editionMetadata = editionMetadataKp.publicKey;

  let gIndexer: GIndexer;
  let nftRpc: NFTRpc;

  it("Can initialize indexer", async () => {
    gIndexer = await createGIndexer(program);
    await gIndexer.clearAll();
    nftRpc = new NFTRpc(gIndexer);
  });
  it("Can initialize collection and edition metadata", async () => {
    const tx = await program.methods
      .initialize("cname", "csymbol", 10000, "ename", "edesc", 100)
      .accounts({
        owner: program.provider.publicKey,
        collection,
        editionMetadata,
      })
      .signers([collectionKp, editionMetadataKp])
      .rpc({ commitment: "confirmed" });

    const txResult = await program.provider.connection.getTransaction(tx, {
      commitment: "confirmed",
    });

    await gIndexer.handleTransaction(txResult);
  });
  it("Can mint a Master Edition NFT", async () => {
    const tx = await program.methods
      .mintMasterEdition(0, "masterName", "masterSymbol", "masterUri")
      .accounts({
        owner: program.provider.publicKey,
        collection,
        editionMetadata,
      })
      .rpc({ commitment: "confirmed" });

    const txResult = await program.provider.connection.getTransaction(tx, {
      commitment: "confirmed",
    });

    await gIndexer.handleTransaction(txResult);

    // Test parsing
    let collectionAssets = await nftRpc.fetchNFTsinCollection(collection);

    assert(collectionAssets.length === 1, "Collection should have 1 asset");
    let asset = collectionAssets[0].toJSON();

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
      "NFT Asset must have assetId as 3rd key"
    );

    let nft = await nftRpc.fetchNFT(new anchor.web3.PublicKey(asset.assetId));
    assert(nft, "NFT must exist");
    assert(nft["name"] === "name", "NFT must have correct name");
    assert(nft["uri"] === "uri", "NFT must have correct uri");
    assert(nft["symbol"] === "symbol", "NFT must have correct symbol");
  });
  it("Can mint an Edition NFT", async () => {
    const tx = await program.methods
      .mintEdition(1, 1, "editionName", "editionSymbol", "editionUri")
      .accounts({
        owner: program.provider.publicKey,
        collection,
        editionMetadata,
      })
      .rpc({ commitment: "confirmed" });

    const txResult = await program.provider.connection.getTransaction(tx, {
      commitment: "confirmed",
    });

    await gIndexer.handleTransaction(txResult);

    // Test parsing
    let collectionAssets = await nftRpc.fetchNFTsinCollection(collection);

    assert(collectionAssets.length === 1, "Collection should have 1 asset");
    let asset = collectionAssets[0].toJSON();

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
      "NFT Asset must have assetId as 3rd key"
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
      .transfer(0, 1)
      .accounts({
        owner: program.provider.publicKey,
        dest: randomDestination,
        collection,
        editionMetadata,
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
    let asset = destAssets[0].toJSON();
    assert(asset.pubkeys.length >= 3, "NFT Asset must have 3 pubkeys minimum");
    assert(
      asset.pubkeys[1] === randomDestination.toBase58(),
      "Transferring an NFT Asset must update the delegate as the second key (in this case we set it to dest)"
    );
  });
  it("Can burn an NFT", async () => {
    const tx = await program.methods
      .burn(0, 1)
      .accounts({
        owner: program.provider.publicKey,
        collection,
        editionMetadata,
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
  });
  after(async () => {
    console.log("Closing Redis connection");
    await gIndexer.client.close();
  });
});
