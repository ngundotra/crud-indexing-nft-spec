use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ITransfer<'info> {
    /// CHECK:
    pub owner: AccountInfo<'info>,
    /// CHECK:
    pub destination: AccountInfo<'info>,
    pub authority: Signer<'info>,
    /// CHECK:
    pub asset: AccountInfo<'info>,
}
