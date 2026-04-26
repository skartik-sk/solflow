#![no_std]

use quasar_lang::prelude::*;

mod instructions;
use instructions::*;
pub mod state;

declare_id!("QuaSar11111111111111111111111111111111111111");

#[program]
mod quasar_events {
    use super::*;

    #[instruction(discriminator = 0)]
    pub fn emit_counter(ctx: Ctx<EmitCounter>, value: u64) -> Result<(), ProgramError> {
        ctx.accounts.handler(value)
    }

    #[instruction(discriminator = 1)]
    pub fn reset_counter(ctx: Ctx<ResetCounter>) -> Result<(), ProgramError> {
        ctx.accounts.handler()
    }
}

#[event]
pub struct CounterEvent {
    pub value: u64,
}

#[error_code]
pub enum CounterError {
    #[msg("Counter value overflowed")]
    Overflow,
}
