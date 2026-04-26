#![no_std]

use pinocchio::{
    account_info::AccountInfo,
    entrypoint,
    program_error::ProgramError,
    pubkey::Pubkey,
    ProgramResult,
};

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    match data.split_first() {
        Some((0, data)) => initialize(program_id, accounts, data),
        Some((1, data)) => transfer(program_id, accounts, data),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

#[repr(C)]
pub struct InitializeInstructionData {
    pub bump: u8,
}

#[repr(C)]
pub struct TransferInstructionData {
    pub amount: u64,
}

pub fn initialize(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _data: &[u8],
) -> ProgramResult {
    Ok(())
}

pub fn transfer(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _data: &[u8],
) -> ProgramResult {
    Ok(())
}
