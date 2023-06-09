use anchor_lang::prelude::*;
use anchor_lang::Discriminator;
use nft_events::{
    emit_create_nft_collection, emit_create_nft_metadata, emit_update_nft_collection,
    emit_update_nft_metadata, get_collection_discriminator, get_metadata_discriminator,
    NftCollectionAsset, NftMetadataAsset,
};
use serde::{self, Serialize};
use serde_json;

use additional_accounts_request::{IAccountMeta, PreflightPayload};
use bs58_pubkey::serde_pubkey;

declare_id!("HzdXYkZw3589BQMS4JqS85chZH8PFGRZmyqTvEYB1Udh");

#[program]
pub mod nft_style_one {

    use anchor_lang::solana_program::program::set_return_data;

    use super::*;

    pub fn init_collection(ctx: Context<InitCollection>, num_items: u32) -> Result<()> {
        ctx.accounts.collection.authority = *ctx.accounts.owner.key;
        ctx.accounts.collection.num_items = num_items;

        // Issue a collection
        emit_create_nft_collection!(NftCollectionAsset {
            authority: ctx.accounts.owner.key(),
            asset_id: ctx.accounts.collection.key(),
            pubkeys: vec![ctx.accounts.collection.key().clone()],
            data: vec![],
        });
        Ok(())
    }

    pub fn mint(
        ctx: Context<MintMe>,
        collection_num: u32,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        ctx.accounts.asset.collection = ctx.accounts.collection.key();
        ctx.accounts.asset.collection_num = collection_num;
        ctx.accounts.asset.name = name.clone();
        ctx.accounts.asset.symbol = symbol.clone();
        ctx.accounts.asset.uri = uri.clone();
        ctx.accounts.asset.owner = *ctx.accounts.owner.key;
        ctx.accounts.asset.delegate = *ctx.accounts.owner.key;

        // Issue a metadata
        emit_create_nft_metadata!(NftMetadataAsset {
            authority: ctx.accounts.owner.key(),
            asset_id: ctx.accounts.asset.key(),
            collection: ctx.accounts.collection.key().clone(),
            delegate: ctx.accounts.owner.key().clone(),
            pubkeys: vec![],
            data: vec![],
        });

        Ok(())
    }

    pub fn preflight_transfer(ctx: Context<ITransfer>) -> Result<()> {
        let event_authority = Pubkey::find_program_address(
            &[&ctx.program_id.as_ref(), b"__event_authority"],
            &ctx.program_id,
        )
        .0;

        set_return_data(
            &PreflightPayload {
                accounts: vec![
                    IAccountMeta {
                        pubkey: ctx.accounts.asset.collection.key(),
                        signer: false,
                        writable: false,
                    },
                    IAccountMeta {
                        pubkey: event_authority,
                        signer: false,
                        writable: false,
                    },
                    IAccountMeta {
                        pubkey: *ctx.program_id,
                        signer: false,
                        writable: false,
                    },
                ],
            }
            .try_to_vec()
            .unwrap(),
        );
        Ok(())
    }

    pub fn transfer(ctx: Context<TransferMe>) -> Result<()> {
        assert!(
            ctx.accounts.asset.owner == *ctx.accounts.authority.key
                || ctx.accounts.asset.delegate == *ctx.accounts.authority.key
        );
        ctx.accounts.asset.owner = *ctx.accounts.destination.key;

        emit_update_nft_metadata!(NftMetadataAsset {
            authority: ctx.accounts.destination.key(),
            asset_id: ctx.accounts.asset.key(),
            collection: ctx.accounts.collection.key().clone(),
            delegate: ctx.accounts.destination.key().clone(),
            pubkeys: vec![],
            data: vec![],
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
        } else {
            "".to_string()
        };
        anchor_lang::solana_program::program::set_return_data(&json_data.as_bytes());
        Ok(())
    }
}

#[derive(Debug, Serialize)]
#[account]
pub struct Metadata {
    #[serde(with = "serde_pubkey")]
    collection: Pubkey,
    collection_num: u32,
    #[serde(with = "serde_pubkey")]
    owner: Pubkey,
    #[serde(with = "serde_pubkey")]
    delegate: Pubkey,
    name: String,
    symbol: String,
    uri: String,
}

#[derive(Debug, Serialize)]
#[account]
pub struct Collection {
    #[serde(with = "serde_pubkey")]
    pub authority: Pubkey,
    pub num_items: u32,
}

#[event_cpi]
#[derive(Accounts)]
pub struct InitCollection<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(init, payer=owner, space = 8 + 32 + 4)]
    pub collection: Account<'info, Collection>,
    pub system_program: Program<'info, System>,
}

#[event_cpi]
#[derive(Accounts)]
#[instruction(collection_num: u32, name: String, symbol: String, uri: String)]
pub struct MintMe<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub collection: Account<'info, Collection>,
    #[account(init, payer=owner, space = 8 + 32 + 4 + 32 + 32 + 4 + name.len() + 4 + symbol.len() + 4 + uri.len(), seeds = [collection.key().as_ref(), b"metadata".as_ref(), &collection_num.to_le_bytes()], bump)]
    pub asset: Account<'info, Metadata>,
    pub system_program: Program<'info, System>,
}

#[event_cpi]
#[derive(Accounts)]
pub struct TransferMe<'info> {
    /// CHECK:
    pub owner: AccountInfo<'info>,
    /// CHECK: recipient
    pub destination: AccountInfo<'info>,
    pub authority: Signer<'info>,
    #[account(mut, seeds = [collection.key().as_ref(), b"metadata".as_ref(), &asset.collection_num.to_le_bytes()], bump)]
    pub asset: Account<'info, Metadata>,
    pub collection: Account<'info, Collection>,
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

// This is a copy-paste from `additional-accounts-request` crate, needed
// to make sure that we can deserialize the return data in
// our typescript client
#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ExternalIAccountMeta {
    pub pubkey: Pubkey,
    pub signer: bool,
    pub writable: bool,
}

/// Interface Preflight
#[derive(Accounts)]
pub struct ITransfer<'info> {
    /// CHECK:
    pub owner: AccountInfo<'info>,
    /// CHECK:
    pub destination: AccountInfo<'info>,
    pub authority: Signer<'info>,
    /// CHECK:
    pub asset: Account<'info, Metadata>,
}
