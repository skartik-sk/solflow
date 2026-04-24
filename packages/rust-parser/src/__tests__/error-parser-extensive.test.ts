import { describe, it, expect } from "vitest";
import { parseErrors } from "../parsers/error-parser";

describe("parseErrors — basic", () => {
  it("parses #[error_code] enum with messages", () => {
    const src = `
#[error_code]
pub enum MyError {
    #[msg("Something went wrong")]
    SomethingWrong,
    #[msg("Invalid amount")]
    InvalidAmount,
}
`;
    const errors = parseErrors(src);
    expect(errors).toHaveLength(2);
    expect(errors[0].name).toBe("SomethingWrong");
    expect(errors[0].message).toBe("Something went wrong");
    expect(errors[0].code).toBe(6000);
    expect(errors[1].name).toBe("InvalidAmount");
    expect(errors[1].message).toBe("Invalid amount");
    expect(errors[1].code).toBe(6001);
  });

  it("returns empty array for no errors", () => {
    const src = `
pub struct MyState {
    pub field: u64,
}
`;
    const errors = parseErrors(src);
    expect(errors).toHaveLength(0);
  });

  it("increments codes starting from 6000", () => {
    const src = `
#[error_code]
pub enum Errors {
    #[msg("First")]
    First,
    #[msg("Second")]
    Second,
    #[msg("Third")]
    Third,
}
`;
    const errors = parseErrors(src);
    expect(errors[0].code).toBe(6000);
    expect(errors[1].code).toBe(6001);
    expect(errors[2].code).toBe(6002);
  });
});

describe("parseErrors — multiple error enums", () => {
  it("parses two separate error enums", () => {
    const src = `
#[error_code]
pub enum ErrorA {
    #[msg("Error A1")]
    A1,
}

#[error_code]
pub enum ErrorB {
    #[msg("Error B1")]
    B1,
}
`;
    const errors = parseErrors(src);
    // Both enums should produce errors
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});
