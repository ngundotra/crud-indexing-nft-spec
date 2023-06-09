#[derive(Accounts)]
pub struct ITransfer<'info> {
    /// CHECK:
    pub owner: AccountInfo<'info>,
    /// CHECK:
    pub to: AccountInfo<'info>,
    pub authority: Signer<'info>,
    /// CHECK:
    pub mint: AccountInfo<'info>,
}

// This allows us to create a new context out of `ITransfer`
// that uses `mint` account as the target program.
impl<'info> ToTargetProgram<'info> for ITransfer<'info> {
    type TargetCtx<'a> = ITransfer<'a>;

    fn to_target_program(&self) -> Pubkey {
        self.mint.key()
    }
    fn get_target_program(&self) -> AccountInfo<'info> {
        self.mint.clone()
    }

    fn to_target_context(
        &self,
        remaining_accounts: Vec<AccountInfo<'info>>,
    ) -> CpiContext<'_, '_, '_, 'info, Self::TargetCtx<'info>> {
        let inner = ITransfer {
            to: self.to.to_account_info(),
            mint: self.mint.to_account_info(),
            owner: self.owner.to_account_info(),
            authority: self.authority.clone(),
        };
        CpiContext::new(self.get_target_program(), inner)
            .with_remaining_accounts(remaining_accounts)
    }
}
