use anchor_lang::prelude::*;

use nft_instructions::{ITransfer, ITransferPda};

declare_id!("FbNmDTqYyvxU9gk3AWUXcQwDMo8vy4YeonJDBu5uCU2t");

#[program]
pub mod marketplace {
    use additional_accounts_request::{call_interface_function, call_preflight_interface_function};
    use anchor_lang::solana_program::program::{get_return_data, set_return_data};
    use anchor_lang::system_program::Transfer;
    use nft_instructions::ITransfer;

    use super::*;

    pub fn swap(ctx: Context<Swap>) -> Result<()> {
        // additional accounts transfer A

        // additional accounts transfer B

        Ok(())
    }

    pub fn preflight_list(ctx: Context<List>, price: u64) -> Result<()> {
        call_preflight_interface_function(
            "transfer".to_string(),
            &CpiContext::new(
                ctx.accounts.nft_program.to_account_info(),
                ITransfer {
                    authority: ctx.accounts.authority.to_account_info(),
                    owner: ctx.accounts.asset_owner.clone(),
                    asset: ctx.accounts.asset.clone(),
                    destination: ctx.accounts.marketplace_listing.to_account_info(),
                },
            ),
            &[],
        )?;
        let (key, return_data) = get_return_data().unwrap();
        assert_eq!(key, *ctx.accounts.nft_program.key);
        set_return_data(&return_data);
        Ok(())
    }

    pub fn list<'info>(ctx: Context<'_, '_, '_, 'info, List<'info>>, price: u64) -> Result<()> {
        // additional accounts transfer
        nft_instructions::transfer(
            CpiContext::new(
                ctx.accounts.nft_program.clone(),
                ITransfer {
                    authority: ctx.accounts.authority.to_account_info(),
                    owner: ctx.accounts.asset_owner.clone(),
                    asset: ctx.accounts.asset.clone(),
                    destination: ctx.accounts.marketplace_listing.to_account_info(),
                },
            )
            .with_remaining_accounts(ctx.remaining_accounts.to_vec()),
            false,
        )?;

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.clone().to_account_info(),
                Transfer {
                    from: ctx.accounts.authority.to_account_info(),
                    to: ctx.accounts.marketplace_listing.to_account_info(),
                },
            ),
            price,
        )?;

        ctx.accounts.marketplace_listing.set_inner(Listing {
            asset_id: *ctx.accounts.asset.key,
            program_id: *ctx.accounts.nft_program.key,
            price,
            authority: *ctx.accounts.authority.key,
            fund_recipient: *ctx.accounts.fund_recipient.key,
        });

        Ok(())
    }

    pub fn preflight_buy_listing(ctx: Context<BuyListing>) -> Result<()> {
        let bump = *ctx.bumps.get("marketplace_listing").unwrap();
        let listing = &ctx.accounts.marketplace_listing;
        let seeds = &[b"listing".as_ref(), &listing.price.to_le_bytes(), &[bump]];
        let signer = &[&seeds[..]];
        call_preflight_interface_function(
            "transfer".to_string(),
            &CpiContext::new_with_signer(
                ctx.accounts.nft_program.to_account_info(),
                ITransfer {
                    authority: listing.to_account_info(),
                    owner: ctx.accounts.asset_owner.clone(),
                    asset: ctx.accounts.asset.clone(),
                    destination: ctx.accounts.buyer.to_account_info(),
                },
                signer,
            ),
            &[],
        )?;
        let (key, return_data) = get_return_data().unwrap();
        assert_eq!(key, *ctx.accounts.nft_program.key);
        set_return_data(&return_data);
        Ok(())
    }

    pub fn buy_listing<'info>(ctx: Context<'_, '_, '_, 'info, BuyListing<'info>>) -> Result<()> {
        // additional accounts transfer
        let nft_program = &ctx.accounts.nft_program;
        let asset = &ctx.accounts.asset;
        let listing = &ctx.accounts.marketplace_listing;
        let bump = *ctx.bumps.get("marketplace_listing").unwrap();
        let seeds = &[
            b"listing".as_ref(),
            &nft_program.key.as_ref(),
            &asset.key.as_ref(),
            &listing.price.to_le_bytes(),
            &[bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.nft_program.clone(),
            ITransferPda {
                authority: listing.to_account_info(),
                owner: ctx.accounts.asset_owner.clone(),
                asset: ctx.accounts.asset.clone(),
                destination: ctx.accounts.buyer.to_account_info(),
            },
            signer,
        )
        .with_remaining_accounts(ctx.remaining_accounts.to_vec());
        nft_instructions::transfer_pda(cpi_ctx, false)?;

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    to: ctx.accounts.fund_recipient.to_account_info(),
                    from: ctx.accounts.buyer.to_account_info(),
                },
            ),
            listing.price,
        )?;

        ctx.accounts
            .marketplace_listing
            .close(ctx.accounts.fund_recipient.to_account_info())?;

        Ok(())
    }
}

#[account]
pub struct Listing {
    pub asset_id: Pubkey,
    pub program_id: Pubkey,
    pub price: u64,
    pub authority: Pubkey,
    pub fund_recipient: Pubkey,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    /// CHECK:
    nft_program_a: AccountInfo<'info>,
    /// CHECK:
    asset_id_a: AccountInfo<'info>,
    /// CHECK:
    authority_a: Signer<'info>,
    /// CHECK:
    nft_program_b: AccountInfo<'info>,
    /// CHECK:
    asset_id_b: AccountInfo<'info>,
    /// CHECK:
    authority_b: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(price: u64)]
pub struct List<'info> {
    /// CHECK: Checked by CPI
    nft_program: AccountInfo<'info>,
    /// CHECK: Checked by CPI
    #[account(mut)]
    asset: AccountInfo<'info>,
    /// CHECK: Checked by CPI
    asset_owner: AccountInfo<'info>,
    #[account(mut)]
    authority: Signer<'info>,
    /// CHECK: Checked by CPI
    fund_recipient: AccountInfo<'info>,
    #[account(init, space = 8 + 32 + 32 + 8 + 32 + 32, payer = authority, seeds = [b"listing".as_ref(), &nft_program.key.as_ref(), &asset.key.as_ref(), &price.to_le_bytes()], bump)]
    marketplace_listing: Account<'info, Listing>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyListing<'info> {
    /// CHECK:
    nft_program: AccountInfo<'info>,
    /// CHECK:
    #[account(mut)]
    asset: AccountInfo<'info>,
    /// CHECK:
    asset_owner: AccountInfo<'info>,
    /// CHECK:
    #[account(mut)]
    buyer: Signer<'info>,
    /// CHECK:
    #[account(mut)]
    fund_recipient: AccountInfo<'info>,
    #[account(mut, seeds = [b"listing".as_ref(), &nft_program.key.as_ref(), &asset.key.as_ref(), &marketplace_listing.price.to_le_bytes()], bump)]
    marketplace_listing: Account<'info, Listing>,
    system_program: Program<'info, System>,
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
