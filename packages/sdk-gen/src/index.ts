// packages/sdk-gen/src/index.ts
// Public API for @solflow/sdk-gen

export { irToCodamaIDL, mapSolanaTypeToCodama } from "./ir-to-codama";
export { irToAnchorIDL } from "./ir-to-anchor-idl";
export type { AnchorIDL } from "./ir-to-anchor-idl";
export { generateSDK } from "./generate-sdk";
export type { GeneratedSDKFile, SDKGenerationResult } from "./types";
