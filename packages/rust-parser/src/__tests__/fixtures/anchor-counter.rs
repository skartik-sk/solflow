// Anchor counter program — test fixture for rust-parser.

use anchor_lang::prelude::*;

declare_id!("Counter1111111111111111111111111111111111111111");

#[program]
pub mod counter {
    use super::*;

    /// Creates a new counter account initialized to 0
    pub fn create(ctx: Context<Create>) -> Result<()> {
        ctx.accounts.counter.count = 0;
        Ok(())
    }

    /// Increments the counter by 1
    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        ctx.accounts.counter.count += 1;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Create<'info> {
    #[account(init, payer = user, space = 8 + 8)]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Increment<'info> {
    #[account(mut)]
    pub counter: Account<'info, Counter>,
}

#[account]
pub struct Counter {
    pub count: u64,
}

#[error_code]
pub enum CounterError {
    #[msg("The counter has overflowed")]
    Overflow,
    #[msg("The counter has underflowed")]
    Underflow,
}

#[event]
pub struct CounterIncremented {
    pub new_count: u64,
}
