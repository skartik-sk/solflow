use quasar_lang::prelude::*;

#[account]
pub struct Counter {
    pub value: u64,
}

impl Counter {
    pub fn seeds() -> [&'static [u8]; 1] {
        [b"counter"]
    }
}
