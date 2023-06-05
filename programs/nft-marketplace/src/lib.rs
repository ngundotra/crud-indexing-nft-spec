use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod nft_marketplace {
    use super::*;

    pub fn swap(ctx: Context<Swap>) -> Result<()> {
        // cpi preflight request

        // cpi preflight request
        Ok(())
    }

    pub fn list(ctx: Context<ListNFT>, price: u64) -> Result<()> {
        Ok(())
    }

    pub fn buy(ctx: Context<ListNFT>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Swap<'info> {
    programA: AccountInfo<'info>,
    assetIdA: AccountInfo<'info>,
    authorityA: Signer<'info>,
    ownerA: AccountInfo<'info>,
    programB: AccountInfo<'info>,
    assetIdB: AccountInfo<'info>,
    authorityB: Signer<'info>,
    ownerB: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ListNFT<'info> {
    program: AccountInfo<'info>,
    assetId: AccountInfo<'info>,
    authority: Signer<'info>,
    owner: AccountInfo<'info>,
}
