use additional_accounts_request::{IAccountMeta, PreflightPayload};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::set_return_data;

declare_id!("EpUCijoepCSP7wEMmKZcB5V7aXt19E6YhuWKYKuayj2D");

fn get_pubkey(num: u32) -> Pubkey {
    Pubkey::find_program_address(&["key".as_ref(), &num.to_le_bytes()], &crate::id()).0
}

fn create_accounts(num_accounts: u32) -> Vec<IAccountMeta> {
    let mut accounts: Vec<IAccountMeta> = vec![];
    for idx in 0..num_accounts {
        let pubkey = get_pubkey(idx);
        accounts.push(IAccountMeta {
            pubkey,
            signer: false,
            writable: false,
        });
    }
    accounts
}

#[program]
pub mod benchmark_aar_callee {
    use anchor_lang::solana_program::log::sol_log_compute_units;

    use super::*;

    pub fn preflight_transfer(
        ctx: Context<TransferNoExtraAccounts>,
        num_accounts: u32,
    ) -> Result<()> {
        // Setup the base accounts
        let event_authority =
            Pubkey::find_program_address(&[b"__event_authority"], &ctx.program_id).0;
        let mut accounts = vec![
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
        ];

        let additional_accounts = create_accounts(num_accounts);
        accounts.extend_from_slice(&additional_accounts);

        set_return_data(&PreflightPayload { accounts }.try_to_vec()?);
        Ok(())
    }

    pub fn transfer(ctx: Context<Transfer>, num_accounts: u32) -> Result<()> {
        for idx in 0..num_accounts {
            let acct = ctx.remaining_accounts.get(idx as usize).unwrap();
            if acct.key() != get_pubkey(idx) {
                msg!("Invalid account {}", idx);
                return Err(ProgramError::InvalidInstructionData.into());
            }
        }
        Ok(())
    }
}

#[derive(Accounts)]
#[event_cpi]
pub struct Transfer {}

#[derive(Accounts)]
pub struct TransferNoExtraAccounts {}
