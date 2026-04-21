// Anchor marketplace program — test fixture with complex logic patterns.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Mint, TokenAccount};

declare_id!("Market11111111111111111111111111111111111111111");

#[program]
pub mod marketplace {
    use super::*;

    /// Initialize a new marketplace
    pub fn initialize(ctx: Context<Initialize>, fee: u64) -> Result<()> {
        ctx.accounts.marketplace.admin = ctx.accounts.admin.key();
        ctx.accounts.marketplace.fee = fee;
        ctx.accounts.marketplace.bump = *ctx.bumps.get("marketplace").unwrap();
        Ok(())
    }

    /// List an item for sale
    pub fn list(ctx: Context<List>, price: u64) -> Result<()> {
        require!(price > 0, MarketplaceError::InvalidPrice);

        ctx.accounts.listing.seller = ctx.accounts.seller.key();
        ctx.accounts.listing.price = price;

        token::transfer(ctx.accounts.transfer_ctx(), 1)?;

        emit!(ItemListed {
            seller: ctx.accounts.seller.key(),
            price,
        });

        Ok(())
    }

    /// Purchase an item
    pub fn purchase(ctx: Context<Purchase>) -> Result<()> {
        let price = ctx.accounts.listing.price;

        require!(price > 0, MarketplaceError::InvalidPrice);

        let fee_amount = price.checked_mul(ctx.accounts.marketplace.fee).unwrap();
        let seller_amount = price.checked_sub(fee_amount).unwrap();

        // Transfer fee to treasury
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            fee_amount,
        )?;

        // Transfer token to buyer
        token::transfer(ctx.accounts.token_transfer_ctx(), 1)?;

        ctx.accounts.listing.is_sold = true;

        emit!(ItemSold {
            buyer: ctx.accounts.buyer.key(),
            price,
        });

        Ok(())
    }

    /// Delist an item
    pub fn delist(ctx: Context<Delist>) -> Result<()> {
        require!(
            ctx.accounts.listing.seller == ctx.accounts.seller.key(),
            MarketplaceError::Unauthorized
        );

        ctx.accounts.listing.is_active = false;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32 + 8 + 1)]
    pub marketplace: Account<'info, Marketplace>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct List<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(init, payer = seller, space = 8 + 32 + 32 + 8 + 1 + 1)]
    pub listing: Account<'info, Listing>,
    #[account(mut)]
    pub seller_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Purchase<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut)]
    pub listing: Account<'info, Listing>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub buyer_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury: SystemAccount<'info>,
    pub marketplace: Account<'info, Marketplace>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Delist<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(mut)]
    pub listing: Account<'info, Listing>,
}

#[account]
pub struct Marketplace {
    pub admin: Pubkey,
    pub fee: u64,
    pub bump: u8,
}

#[account]
pub struct Listing {
    pub seller: Pubkey,
    pub mint: Pubkey,
    pub price: u64,
    pub is_sold: bool,
    pub is_active: bool,
}

#[error_code]
pub enum MarketplaceError {
    #[msg("Invalid price")]
    InvalidPrice,
    #[msg("Unauthorized")]
    Unauthorized,
}

#[event]
pub struct ItemListed {
    pub seller: Pubkey,
    pub price: u64,
}

#[event]
pub struct ItemSold {
    pub buyer: Pubkey,
    pub price: u64,
}
