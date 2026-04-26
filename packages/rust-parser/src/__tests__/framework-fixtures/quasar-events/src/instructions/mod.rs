use quasar_lang::prelude::*;

use crate::state::Counter;

#[derive(Accounts)]
pub struct EmitCounter {
    #[account(mut)]
    pub payer: Signer,
    #[account(mut, init, payer = payer, seeds = Counter::seeds(), bump)]
    pub counter: Account<Counter>,
    pub system_program: Program<System>,
}

impl EmitCounter {
    pub fn handler(&mut self, value: u64) -> Result<(), ProgramError> {
        self.counter.value = value;
        emit!(crate::CounterEvent { value });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct ResetCounter {
    #[account(mut)]
    pub counter: Account<Counter>,
}

impl ResetCounter {
    pub fn handler(&mut self) -> Result<(), ProgramError> {
        self.counter.value = 0;
        Ok(())
    }
}
