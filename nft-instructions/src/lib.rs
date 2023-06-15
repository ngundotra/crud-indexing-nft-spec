use additional_accounts_request::call;
use anchor_lang::prelude::*;

#[derive(Accounts)]

pub struct ITransfer<'info> {
    /// CHECK:
    pub owner: AccountInfo<'info>,
    /// CHECK:
    pub destination: AccountInfo<'info>,
    /// CHECK:
    pub authority: AccountInfo<'info>,
    /// CHECK:
    pub asset: AccountInfo<'info>,
}

pub struct ITransferPda<'info> {
    /// CHECK:
    pub owner: AccountInfo<'info>,
    /// CHECK:
    pub destination: AccountInfo<'info>,
    /// CHECK:
    pub authority: AccountInfo<'info>,
    /// CHECK:
    pub asset: AccountInfo<'info>,
}

// impl ToAccountInfosSigner
impl<'info> ToAccountMetas for ITransferPda<'info> {
    fn to_account_metas(&self, is_signer: Option<bool>) -> Vec<AccountMeta> {
        let pda_is_auth = is_signer.is_none() || is_signer.is_some() && is_signer.unwrap();
        vec![
            self.owner
                .to_account_metas(is_signer)
                .get(0)
                .unwrap()
                .clone(),
            self.destination
                .to_account_metas(is_signer)
                .get(0)
                .unwrap()
                .clone(),
            // manually override
            self.authority
                .to_account_metas(Some(pda_is_auth))
                .get(0)
                .unwrap()
                .clone(),
            self.asset
                .to_account_metas(is_signer)
                .get(0)
                .unwrap()
                .clone(),
        ]
    }
}

impl<'info> ToAccountInfos<'info> for ITransferPda<'info> {
    fn to_account_infos(&self) -> Vec<AccountInfo<'info>> {
        vec![
            self.owner.clone(),
            self.destination.clone(),
            self.authority.clone(),
            self.asset.clone(),
        ]
    }
}

/// Calls an instruction on a program that complies with the additional accounts interface
///
/// Expects ctx.remaining accounts to have all possible accounts in order to resolve
/// the accounts requested from the preflight function
pub fn transfer<'info>(
    ctx: CpiContext<'_, '_, '_, 'info, ITransfer<'info>>,
    log_info: bool,
) -> Result<()> {
    call("transfer".to_string(), ctx, vec![], log_info)?;
    Ok(())
}

pub fn transfer_pda<'info>(
    ctx: CpiContext<'_, '_, '_, 'info, ITransferPda<'info>>,
    log_info: bool,
) -> Result<()> {
    call("transfer".to_string(), ctx, vec![], log_info)?;
    Ok(())
}
