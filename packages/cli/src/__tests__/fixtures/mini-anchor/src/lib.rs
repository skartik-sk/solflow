use anchor_lang::prelude::*;

declare_id!("Mini11111111111111111111111111111111111111111");

#[program]
pub mod mini_anchor {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, value: u64) -> Result<()> {
        ctx.accounts.data.value = value;
        Ok(())
    }

    pub fn update(ctx: Context<Update>, new_value: u64) -> Result<()> {
        require!(new_value > 0, MiniError::InvalidValue);
        ctx.accounts.data.value = new_value;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + 8)]
    pub data: Account<'info, Data>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Update<'info> {
    #[account(mut)]
    pub data: Account<'info, Data>,
    pub authority: Signer<'info>,
}

#[account]
pub struct Data {
    pub value: u64,
}

#[error_code]
pub enum MiniError {
    #[msg("Invalid value")]
    InvalidValue,
}
