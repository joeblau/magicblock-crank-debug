use anchor_lang::prelude::*;

declare_id!("8RT6jMFXpLXcLLNNUUbC57sro7uLJuKHYZkVGRYtzt14");

#[program]
pub mod crank {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
