use anchor_lang::prelude::*;

pub use nft_events_macros::*;

pub struct NftCollectionAsset {
    pub asset_id: Pubkey,
    pub authority: Pubkey,
    pub pubkeys: Vec<Pubkey>,
    pub data: Vec<u8>,
}

pub struct NftMetadataAsset {
    pub asset_id: Pubkey,
    pub authority: Pubkey,
    pub collection: Pubkey,
    pub delegate: Pubkey,
    pub pubkeys: Vec<Pubkey>,
    pub data: Vec<u8>,
}

pub fn get_collection_discriminator() -> Result<Vec<u8>> {
    let disc = anchor_lang::solana_program::hash::hash(b"srfc19:collection")
        .try_to_vec()
        .unwrap();
    let data = disc[0..8].to_vec();
    return Ok(data);
}

pub fn get_metadata_discriminator() -> Result<Vec<u8>> {
    let disc = anchor_lang::solana_program::hash::hash(b"srfc19:metadata")
        .try_to_vec()
        .unwrap();
    let data = disc[0..8].to_vec();
    return Ok(data);
}
