# sRFC 19 - Forkable NFT Programs

Requires sRFC 16 - Generalized Asset Indexing.

# Motivation

We want NFT programs that allow communities
to have complete control over their implementation
while retaining their integration with dApps and wallets.

# Problem

Recent decisions by Metaplex governance has shown that 
Solana NFTs can have their assets and implementation changed
overnight, with no recourse available.

# Solution

We propose a standard protocol for programs to be indexed as NFTs, interpreted as common metadata,
and interacted with via on-chain and off-chain clients using standard instructions.

# Specification

### Instructions

We aim to combine the best features of [ERC 721](https://eips.ethereum.org/EIPS/eip-721) with the best features of SPL Token.

#### Mint
TODO

#### Transfer
TODO

#### Delegate

TODO

#### Burn
TODO

### Grouping

When a program issues an NFT, it has a specific ordering of accounts that _must_ be followed.

The first pubkey must either be a pubkey that specifies a `collection` or a `program id`.
The second pubkey must be either the current `delegate` or the current `owner` of the NFT.

When the NFT is delegated, the NFT must update the 2nd pubkey in the list of pubkeys to be the new `delegate`.

Each AssetGroup emitted for an NFT in `CudCreate` or `CudUpdate` _must_ have the following schema:

```rust
AssetGroup {
    asset_id: Pubkey,
    authority: Pubkey,
    pubkeys: [
        # collection | program id,
        # delegate | owner,
        # etc,
    ],
    data: Vec<u8>
}
```

Other pubkeys may be present in the `AssetGroup`, but are not required for the NFT to be considered valid.

### Rendering Metadata

In accordance with sRFC 16, when each NFT is emitted as an `AssetGroup`, it is rendered by simulating a view function called
`getAssetData` that takes the `AssetGroup` as accounts and input data. 

The rendered JSON _MUST_ have the following fields:

```JSON
{
    "name": "string",
    "symbol": "string",
    "uri": "string",
    "delegate": "string",
    "owner": "string",
}
```

Other fields may be present, but these are _required_ for the NFT to be considered valid.

We note that it's a mess to use JSON on-chain, since it consume CUs aggresively. 
We recommend further research with using TLV<string, string> maps.

# Implementation

The following programs are implemented using this standard:

1. `crud-indexing` (todo: rename to `nft-style-1`)
2. `nft-style-two` 

We also have implemented a marketplace contract for these programs:

`nft-marketplace` which implements a swap between assets of two different such programs,
and both `list` and `buy` instructions for assets of a single program.

We provide a reference implementation of a General Asset Indexer (sRFC #16) that works with any program, 
and then an additional NFT RPC TS client that uses the indexer to provide useful retrieval methods for NFTs.

## Running tests

Running the tests requires `coral-xyz/anchor` to be built from source, as we use features on the master
branch that have not been released (as of 0.27). `Docker` is also required.

1. Install TS dependencies: `yarn install`
2. Symlink anchor locally `ln -s /path/to/anchor/build/debug|release/anchor ./eanchor`
3. Setup docker environment using Postgres with 
`docker run --name postgres -e POSTGRES_PASSWORD=mysecretpassword -d -v ~/PATH-TO-LOCAL-PG-DB:/var/lib/postgresql/data postgres`
5. Run tests: `./eanchor test`


# Checklist

- [ ] AAR for nft style one
- [ ] AAR for nft style two
- [ ] Local Marketplace
- [ ] 10k pfp
- [ ] 10k pfp marketplace