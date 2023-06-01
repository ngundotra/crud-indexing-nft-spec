use anchor_lang::prelude::*;
use anchor_lang::Discriminator;
use serde::{self, Deserialize, Deserializer, Serialize, Serializer};
use serde_json;

mod bs58_pubkey;
use bs58_pubkey::serde_pubkey;

declare_id!("3YtbN69K6qkLsc3nWCPrzSkyNmwzF5uRppmfm9FyYz4k");

pub const SYMBOL_MAX_LEN: usize = 8;
pub const URI_MAX_LEN: usize = 64;
pub const NAME_MAX_LEN: usize = 64;

#[program]
pub mod crud_indexing {
    use super::*;

    pub fn init_collection(ctx: Context<InitCollection>, num_items: u32) -> Result<()> {
        ctx.accounts.collection.authority = *ctx.accounts.owner.key;
        ctx.accounts.collection.num_items = num_items;

        // Issue a collection
        emit_cpi!({
            CrudCreate {
                authority: ctx.accounts.owner.key(),
                asset_id: ctx.accounts.collection.key(),
                pubkeys: vec![ctx.accounts.collection.key().clone()],
                data: vec![],
            }
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
        ctx.accounts.metadata.name = name.clone();
        ctx.accounts.metadata.symbol = symbol.clone();
        ctx.accounts.metadata.uri = uri.clone();
        ctx.accounts.metadata.owner = *ctx.accounts.owner.key;

        // Issue a metadata
        emit_cpi!({
            CrudCreate {
                authority: ctx.accounts.owner.key(),
                asset_id: ctx.accounts.metadata.key(),
                pubkeys: vec![
                    ctx.accounts.collection.key().clone(),
                    ctx.accounts.metadata.key().clone(),
                ],
                data: vec![],
            }
        });

        Ok(())
    }

    pub fn transfer(ctx: Context<TransferMe>, collection_num: u32) -> Result<()> {
        ctx.accounts.metadata.owner = *ctx.accounts.owner.key;

        emit_cpi!({
            CrudTransfer {
                asset_id: ctx.accounts.metadata.key().clone(),
                new_authority: ctx.accounts.dest.key().clone(),
            }
        });

        Ok(())
    }

    pub fn get_asset_data(ctx: Context<GetAssetDataAccounts>, data: Vec<u8>) -> Result<()> {
        let data = ctx.remaining_accounts[1].try_borrow_mut_data()?;

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

// pub fn account_discriminator(account_name: &str) -> [u8; 8] {
//     let discriminator_preimage = { format!("account:{account_name}") };

//     let mut discriminator = [0u8; 8];
//     discriminator.copy_from_slice(
//         &anchor_lang::solana_program::hash::hashv(&[discriminator_preimage.as_bytes()]).to_bytes()
//             [..8],
//     );
//     return discriminator;
// }

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
    #[account(init, payer=owner, space = 8 + 32 + 4 + name.len() + 4 + symbol.len() + 4 + uri.len(), seeds = [collection.key().as_ref(), b"metadata".as_ref(), &collection_num.to_le_bytes()], bump)]
    pub metadata: Account<'info, Metadata>,
    pub system_program: Program<'info, System>,
}

#[event_cpi]
#[derive(Accounts)]
#[instruction(collection_num: u32)]
pub struct TransferMe<'info> {
    pub owner: Signer<'info>,
    /// CHECK: recipient
    pub dest: AccountInfo<'info>,
    pub collection: Account<'info, Collection>,
    #[account(mut, seeds = [collection.key().as_ref(), b"metadata".as_ref(), &collection_num.to_le_bytes()], bump)]
    pub metadata: Account<'info, Metadata>,
}

#[derive(Accounts)]
pub struct GetAssetDataAccounts<'info> {
    /// CHECK:
    pub asset_id: AccountInfo<'info>,
}

#[event]
pub struct CrudCreate {
    asset_id: Pubkey,
    authority: Pubkey,
    pubkeys: Vec<Pubkey>,
    data: Vec<u8>,
}

#[event]
pub struct CrudTransfer {
    asset_id: Pubkey,
    new_authority: Pubkey,
}

#[event]
pub struct CrudUpdate {
    asset_id: Pubkey,
    pubkeys: Vec<Pubkey>,
    data: Vec<u8>,
}

#[event]
pub struct CrudDelete {
    asset_id: Pubkey,
}
