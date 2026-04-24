// Real-world Anchor program — tests parser resilience with various patterns.
// Tests: non-ctx param names, Context<'info, X>, multiple derives, match/if-let,
// cross-struct references, complex generics, doc comments between attributes.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Mint, TokenAccount};

declare_id!("Real11111111111111111111111111111111111111111");

#[program]
pub mod realworld {
    use super::*;

    /// Initialize the protocol config
    pub fn initialize_protocol(
        context: Context<'info, InitializeProtocol>,
    ) -> Result<()> {
        context.accounts.config.admin = context.accounts.admin.key();
        context.accounts.config.fee_rate = 100;
        context.accounts.config.bump = *context.bumps.get("config").unwrap();
        Ok(())
    }

    /// Create a new pool with optional fee override
    pub fn create_pool(
        ctx: Context<CreatePool>,
        fee: u64,
        // Multi-arg with complex types
        name: String,
    ) -> Result<()> {
        require!(fee > 0, RealError::InvalidFee);
        require_gt!(fee, 0, RealError::InvalidFee);

        ctx.accounts.pool.authority = ctx.accounts.authority.key();
        ctx.accounts.pool.fee = fee;
        ctx.accounts.pool.name = name;
        ctx.accounts.pool.bump = *ctx.bumps.get("pool").unwrap();
        ctx.accounts.pool.is_active = true;

        emit!(PoolCreated {
            authority: ctx.accounts.authority.key(),
            fee,
        });

        Ok(())
    }

    /// Deposit tokens into a pool
    pub fn deposit(
        c: Context<Deposit>,
        amount: u64,
    ) -> anchor_lang::Result<()> {
        require!(amount > 0, RealError::InvalidAmount);
        require_gte!(amount, 100, RealError::MinimumNotMet);

        let fee_amount = amount.checked_mul(c.accounts.config.fee_rate).unwrap();
        let deposit_amount = amount.checked_sub(fee_amount).unwrap();

        // Transfer tokens
        token::transfer(c.accounts.transfer_ctx(), amount)?;

        c.accounts.user_deposit.amount += deposit_amount;
        c.accounts.pool.total_deposits += amount;

        emit!(Deposited {
            user: c.accounts.user.key(),
            amount,
            fee: fee_amount,
        });

        Ok(())
    }

    /// Withdraw with match-based logic
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, RealError::InvalidAmount);
        require!(
            ctx.accounts.user_deposit.amount >= amount,
            RealError::InsufficientBalance
        );

        let fee = match ctx.accounts.config.fee_rate {
            0 => 0,
            rate => amount.checked_mul(rate / 100).unwrap(),
        };

        if fee > 0 {
            ctx.accounts.user_deposit.amount -= amount;
        }

        ctx.accounts.pool.total_deposits -= amount;

        match ctx.accounts.pool.is_active {
            true => {
                ctx.accounts.user_deposit.last_withdraw = Clock::get().unwrap().unix_timestamp;
            }
            false => {
                return err!(RealError::PoolInactive);
            }
        }

        emit!(Withdrawn {
            user: ctx.accounts.user.key(),
            amount,
        });

        Ok(())
    }

    /// Close a pool — admin only
    pub fn close_pool(ctx: Context<ClosePool>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.pool.authority,
            ctx.accounts.authority.key(),
            RealError::Unauthorized
        );

        ctx.accounts.pool.is_active = false;

        Ok(())
    }
}

// ─── Account Structs with various derive patterns ────────────────────

#[derive(Accounts, Debug)]
pub struct InitializeProtocol<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 8 + 1
    )]
    pub config: Account<'info, ProtocolConfig>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Debug, Accounts, Clone)]
pub struct CreatePool<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 8 + 32 + 1 + 1
    )]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub config: Account<'info, ProtocolConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_deposit: Account<'info, UserDeposit>,
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    pub config: Account<'info, ProtocolConfig>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_deposit: Account<'info, UserDeposit>,
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    pub config: Account<'info, ProtocolConfig>,
}

#[derive(Accounts)]
pub struct ClosePool<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    pub authority: Signer<'info>,
}

// ─── State Structs ───────────────────────────────────────────────────

/// Global protocol configuration
#[account]
pub struct ProtocolConfig {
    pub admin: Pubkey,
    pub fee_rate: u64,
    pub bump: u8,
}

/// Liquidity pool
#[account]
pub struct Pool {
    pub authority: Pubkey,
    pub fee: u64,
    pub name: String,
    pub total_deposits: u64,
    pub is_active: bool,
    pub bump: u8,
}

/// User deposit tracking
#[account]
pub struct UserDeposit {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub amount: u64,
    pub last_withdraw: i64,
}

// ─── Errors ──────────────────────────────────────────────────────────

#[error_code]
pub enum RealError {
    #[msg("Fee must be greater than 0")]
    InvalidFee,
    #[msg("Amount must be greater than 0")]
    InvalidAmount,
    #[msg("Insufficient balance for withdrawal")]
    InsufficientBalance,
    #[msg("Minimum deposit not met")]
    MinimumNotMet,
    #[msg("Only the authority can perform this action")]
    Unauthorized,
    #[msg("Pool is currently inactive")]
    PoolInactive,
}

// ─── Events ──────────────────────────────────────────────────────────

/// Emitted when a new pool is created
#[event]
pub struct PoolCreated {
    pub authority: Pubkey,
    pub fee: u64,
}

#[event]
pub struct Deposited {
    pub user: Pubkey,
    pub amount: u64,
    pub fee: u64,
}

#[event]
pub struct Withdrawn {
    pub user: Pubkey,
    pub amount: u64,
}
