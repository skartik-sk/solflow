// packages/sdk-gen/src/types.ts
// Public types for the SDK generation pipeline.

/** A single file produced by the SDK generator. */
export interface GeneratedSDKFile {
  /** Relative path within the generated SDK package, e.g. "src/generated/instructions/initialize.ts" */
  path: string;
  /** File contents as a UTF-8 string. */
  content: string;
}

/** Full result returned by generateSDK(). */
export interface SDKGenerationResult {
  /** All generated source files. */
  files: GeneratedSDKFile[];
  /**
   * Suggested npm package name derived from the program name,
   * e.g. "@generated/vault-program-sdk".
   */
  packageName: string;
  /** Codama IDL as a JSON string (for downstream tooling / reimport). */
  idlJson: string;
}
