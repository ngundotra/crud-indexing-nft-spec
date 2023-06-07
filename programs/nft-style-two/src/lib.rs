use anchor_lang::prelude::*;
use anchor_lang::Discriminator;
use serde::{self, Serialize};

use bs58_pubkey::serde_pubkey;

declare_id!("9CB3S1yQhyxf5KFeRa6RYj2Np9qwiUpofZYoDQNKphMo");

#[program]
pub mod nft_style_two {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        collection_name: String,
        collection_symbol: String,
        collection_num_items: u32,
        edition_title: String,
        edition_description: String,
        edition_num_versions: u32,
    ) -> Result<()> {
        ctx.accounts.collection.set_inner(Collection {
            authority: *ctx.accounts.owner.key,
            name: collection_name,
            symbol: collection_symbol,
            num_items: collection_num_items,
        });
        ctx.accounts.edition_metadata.set_inner(EditionMetadata {
            authority: *ctx.accounts.owner.key,
            title: edition_title,
            description: edition_description,
            num_versions: edition_num_versions,
        });

        // Issue a collection
        emit_cpi!({
            CudCreate {
                authority: ctx.accounts.owner.key(),
                asset_id: ctx.accounts.collection.key(),
                pubkeys: vec![
                    ctx.accounts.collection.key(),
                    ctx.accounts.edition_metadata.key(),
                ],
                data: vec![],
            }
        });
        emit_cpi!({
            CudCreate {
                authority: ctx.accounts.owner.key(),
                asset_id: ctx.accounts.edition_metadata.key(),
                pubkeys: vec![
                    ctx.accounts.collection.key(),
                    ctx.accounts.edition_metadata.key(),
                ],
                data: vec![],
            }
        });

        Ok(())
    }

    pub fn mint_master_edition(
        ctx: Context<MintMasterEdition>,
        collection_num: u32,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        assert!(
            collection_num <= ctx.accounts.collection.num_items,
            "Collection item number cannot exceed set maximum value: {}",
            ctx.accounts.collection.num_items
        );

        ctx.accounts.metadata.set_inner(Metadata {
            name,
            symbol,
            uri,
            owner: *ctx.accounts.owner.key,
        });
        ctx.accounts.master_edition.set_inner(MasterEdition {
            authority: *ctx.accounts.owner.key,
        });

        // Issue a metadata
        emit_cpi!({
            CudCreate {
                authority: ctx.accounts.owner.key(),
                asset_id: ctx.accounts.master_edition.key(),
                pubkeys: vec![
                    ctx.accounts.collection.key(),
                    ctx.accounts.edition_metadata.key(),
                    ctx.accounts.master_edition.key(),
                    ctx.accounts.owner.key(),
                    ctx.accounts.metadata.key(),
                ],
                data: vec![],
            }
        });
        emit_cpi!({
            CudCreate {
                authority: ctx.accounts.owner.key(),
                asset_id: ctx.accounts.metadata.key(),
                pubkeys: vec![
                    ctx.accounts.collection.key(),
                    ctx.accounts.edition_metadata.key(),
                    ctx.accounts.master_edition.key(),
                    ctx.accounts.owner.key(),
                    ctx.accounts.metadata.key(),
                ],
                data: vec![],
            }
        });

        Ok(())
    }

    pub fn mint_edition(
        ctx: Context<MintEdition>,
        collection_num: u32,
        edition_num: u32,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        assert!(
            collection_num <= ctx.accounts.collection.num_items,
            "Collection item number cannot exceed set maximum value: {}",
            ctx.accounts.collection.num_items
        );
        assert!(
            edition_num <= ctx.accounts.edition_metadata.num_versions,
            "Edition number cannot exceed set maximum value: {}",
            ctx.accounts.edition_metadata.num_versions
        );

        ctx.accounts.metadata.set_inner(Metadata {
            name,
            symbol,
            uri,
            owner: *ctx.accounts.owner.key,
        });
        ctx.accounts.edition.set_inner(Edition {
            authority: *ctx.accounts.owner.key,
            version: edition_num,
        });

        // Issue a metadata
        emit_cpi!({
            CudCreate {
                authority: ctx.accounts.owner.key(),
                asset_id: ctx.accounts.edition.key(),
                pubkeys: vec![
                    ctx.accounts.collection.key(),
                    ctx.accounts.edition_metadata.key(),
                    ctx.accounts.edition.key(),
                    ctx.accounts.owner.key(),
                    ctx.accounts.metadata.key(),
                ],
                data: vec![],
            }
        });
        emit_cpi!({
            CudCreate {
                authority: ctx.accounts.owner.key(),
                asset_id: ctx.accounts.metadata.key(),
                pubkeys: vec![
                    ctx.accounts.collection.key(),
                    ctx.accounts.edition_metadata.key(),
                    ctx.accounts.edition.key(),
                    ctx.accounts.owner.key(),
                    ctx.accounts.metadata.key(),
                ],
                data: vec![],
            }
        });

        Ok(())
    }

    pub fn transfer(
        ctx: Context<TransferMe>,
        _collection_num: u32,
        _edition_num: u32,
    ) -> Result<()> {
        ctx.accounts.metadata.owner = *ctx.accounts.owner.key;

        emit_cpi!({
            CudUpdate {
                asset_id: ctx.accounts.metadata.key(),
                authority: ctx.accounts.dest.key(),
                pubkeys: vec![
                    ctx.accounts.collection.key(),
                    ctx.accounts.edition.key(),
                    ctx.accounts.owner.key(),
                    ctx.accounts.metadata.key(),
                ],
                data: vec![],
            }
        });

        Ok(())
    }

    pub fn burn(ctx: Context<BurnMe>, _collection_num: u32, _edition_num: u32) -> Result<()> {
        emit_cpi!({
            CudDelete {
                asset_id: ctx.accounts.metadata.key(),
            }
        });

        Ok(())
    }

    pub fn get_asset_data(ctx: Context<GetAssetDataAccounts>, _data: Vec<u8>) -> Result<()> {
        let data = ctx.accounts.asset_id.try_borrow_mut_data()?;

        let account_disc = &data[0..8];
        let json_data = if *account_disc == Metadata::DISCRIMINATOR {
            let metadata_info = Metadata::try_from_slice(&data[8..data.len()])?;

            let data = serde_json::to_string(&metadata_info).unwrap();
            msg!("Found metadata: {}", &data);
            data
        } else if *account_disc == Collection::DISCRIMINATOR {
            let collection_info = Collection::try_from_slice(&data[8..data.len()])?;
            let data = serde_json::to_string(&collection_info).unwrap();
            msg!("Found collection: {}", &data);
            data
        } else if *account_disc == EditionMetadata::DISCRIMINATOR {
            let edition_metadata = EditionMetadata::try_from_slice(&data[8..data.len()])?;
            let data = serde_json::to_string(&edition_metadata).unwrap();
            msg!("Found collection: {}", &data);
            data
        } else if *account_disc == Edition::DISCRIMINATOR {
            let edition = Edition::try_from_slice(&data[8..data.len()])?;
            let data = serde_json::to_string(&edition).unwrap();
            msg!("Found edition: {}", &data);
            data
        } else if *account_disc == MasterEdition::DISCRIMINATOR {
            let master_edition = MasterEdition::try_from_slice(&data[8..data.len()])?;
            let data = serde_json::to_string(&master_edition).unwrap();
            msg!("Found master edition: {}", &data);
            data
        } else {
            "".to_string()
        };
        anchor_lang::solana_program::program::set_return_data(json_data.as_bytes());
        Ok(())
    }
}

#[derive(Debug, Serialize)]
#[account]
pub struct Metadata {
    #[serde(with = "serde_pubkey")]
    owner: Pubkey,
    name: String,
    symbol: String,
    uri: String,
}

#[derive(Debug, Serialize)]
#[account]
pub struct Collection {
    #[serde(with = "serde_pubkey")]
    pub authority: Pubkey,
    pub name: String,
    pub symbol: String,
    pub num_items: u32,
}

#[derive(Debug, Serialize)]
#[account]
pub struct EditionMetadata {
    #[serde(with = "serde_pubkey")]
    pub authority: Pubkey,
    pub title: String,
    pub description: String,
    pub num_versions: u32,
}

#[derive(Debug, Serialize)]
#[account]
pub struct Edition {
    #[serde(with = "serde_pubkey")]
    pub authority: Pubkey,
    pub version: u32,
}

#[derive(Debug, Serialize)]
#[account]
pub struct MasterEdition {
    #[serde(with = "serde_pubkey")]
    pub authority: Pubkey,
}

#[event_cpi]
#[derive(Accounts)]
#[instruction(
    collection_name: String,
    collection_symbol: String,
    collection_num_items: u32,
    edition_title: String,
    edition_description: String,
    edition_num_versions: u32,
)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(init, payer=owner, space = 8 + 32 + 4 + collection_name.len() + 4 + collection_symbol.len() + 4)]
    pub collection: Account<'info, Collection>,
    #[account(init, payer=owner, space = 8 + 32 + 4 + edition_title.len() + 4 + edition_description.len() + 4)]
    pub edition_metadata: Account<'info, EditionMetadata>,
    pub system_program: Program<'info, System>,
}

#[event_cpi]
#[derive(Accounts)]
#[instruction(collection_num: u32, name: String, symbol: String, uri: String)]
pub struct MintMasterEdition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub collection: Account<'info, Collection>,
    pub edition_metadata: Account<'info, EditionMetadata>,
    #[account(init, payer=owner, space = 8 + 32 + 4 + edition_metadata.title.len() + 4 + edition_metadata.description.len(), seeds = [edition_metadata.key().as_ref(), b"master_edition".as_ref()], bump)]
    pub master_edition: Account<'info, MasterEdition>,
    #[account(init, payer=owner, space = 8 + 32 + 4 + name.len() + 4 + symbol.len() + 4 + uri.len(), seeds = [collection.key().as_ref(), b"metadata".as_ref(), &collection_num.to_le_bytes()], bump)]
    pub metadata: Account<'info, Metadata>,
    pub system_program: Program<'info, System>,
}

#[event_cpi]
#[derive(Accounts)]
#[instruction(collection_num: u32, edition_num: u32, name: String, symbol: String, uri: String)]
pub struct MintEdition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub collection: Account<'info, Collection>,
    pub edition_metadata: Account<'info, EditionMetadata>,
    #[account(init, payer=owner, space = 8 + 32 + 4 + edition_metadata.title.len() + 4 + edition_metadata.description.len(), seeds = [edition_metadata.key().as_ref(), b"version".as_ref(), &edition_num.to_le_bytes()], bump)]
    pub edition: Account<'info, Edition>,
    #[account(init, payer=owner, space = 8 + 32 + 4 + name.len() + 4 + symbol.len() + 4 + uri.len(), seeds = [collection.key().as_ref(), b"metadata".as_ref(), &collection_num.to_le_bytes()], bump)]
    pub metadata: Account<'info, Metadata>,
    pub system_program: Program<'info, System>,
}

#[event_cpi]
#[derive(Accounts)]
#[instruction(collection_num: u32, edition_num: u32)]
pub struct TransferMe<'info> {
    pub owner: Signer<'info>,
    /// CHECK: recipient
    pub dest: AccountInfo<'info>,
    pub collection: Account<'info, Collection>,
    pub edition_metadata: Account<'info, EditionMetadata>,
    #[account(mut, seeds = [edition_metadata.key().as_ref(), b"version".as_ref(), &edition_num.to_le_bytes()], bump)]
    pub edition: Account<'info, Edition>,
    #[account(mut, seeds = [collection.key().as_ref(), b"metadata".as_ref(), &collection_num.to_le_bytes()], bump)]
    pub metadata: Account<'info, Metadata>,
}

#[event_cpi]
#[derive(Accounts)]
#[instruction(collection_num: u32, edition_num: u32)]
pub struct BurnMe<'info> {
    pub owner: Signer<'info>,
    pub collection: Account<'info, Collection>,
    pub edition_metadata: Account<'info, EditionMetadata>,
    #[account(mut, seeds = [edition_metadata.key().as_ref(), b"version".as_ref(), &edition_num.to_le_bytes()], bump)]
    pub edition: Account<'info, Edition>,
    #[account(mut, seeds = [collection.key().as_ref(), b"metadata".as_ref(), &collection_num.to_le_bytes()], bump)]
    pub metadata: Account<'info, Metadata>,
}

#[derive(Accounts)]
pub struct GetAssetDataAccounts<'info> {
    /// CHECK:
    pub asset_id: AccountInfo<'info>,
    /// CHECK:
    pub authority: AccountInfo<'info>,
}

#[event]
pub struct CudCreate {
    asset_id: Pubkey,
    authority: Pubkey,
    pubkeys: Vec<Pubkey>,
    data: Vec<u8>,
}

#[event]
pub struct CudUpdate {
    asset_id: Pubkey,
    authority: Pubkey,
    pubkeys: Vec<Pubkey>,
    data: Vec<u8>,
}

#[event]
pub struct CudDelete {
    asset_id: Pubkey,
}
