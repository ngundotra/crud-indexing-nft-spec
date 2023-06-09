use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod marketplace {
    use super::*;

    pub fn swap(ctx: Context<Swap>) -> Result<()> {
        // additional accounts transfer A

        // additional accounts transfer B

        Ok(())
    }

    pub fn list(ctx: Context<List>, price: u64) -> Result<()> {
        // additional accounts transfer

        ctx.accounts.marketplace_listing.set_inner(Listing {
            asset_id: *ctx.accounts.asset_id.key,
            program_id: *ctx.accounts.nft_program.key,
            price,
            authority: *ctx.accounts.authority.key,
        });

        Ok(())
    }

    pub fn buy_listing(ctx: Context<BuyListing>) -> Result<()> {
        Ok(())
    }
}

#[account]
pub struct Listing {
    pub asset_id: Pubkey,
    pub program_id: Pubkey,
    pub price: u64,
    pub authority: Pubkey,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    /// CHECK:
    nft_program_a: AccountInfo<'info>,
    /// CHECK:
    asset_id_a: AccountInfo<'info>,
    authority_a: Signer<'info>,
    /// CHECK:
    nft_program_b: AccountInfo<'info>,
    /// CHECK:
    asset_id_b: AccountInfo<'info>,
    authority_b: Signer<'info>,
}

#[derive(Accounts)]
pub struct List<'info> {
    /// CHECK:
    nft_program: AccountInfo<'info>,
    /// CHECK:
    asset_id: AccountInfo<'info>,
    authority: Signer<'info>,
    marketplace_listing: Account<'info, Listing>,
}

#[derive(Accounts)]
pub struct BuyListing<'info> {
    /// CHECK:
    program: AccountInfo<'info>,
    /// CHECK:
    asset_id: AccountInfo<'info>,
    authority: Signer<'info>,
    /// CHECK:
    owner: AccountInfo<'info>,
    marketplace_listing: Account<'info, Listing>,
}
