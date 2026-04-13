use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
mod template {
    use super::*;
    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
