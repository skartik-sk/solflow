/**
 * Resolve a require/return-error code to a Rust error expression.
 * Parsed source may carry a path (`MyError::Bad`) — keep only the variant, since the
 * generated enum is always `<Program>Error`. An empty code (e.g. `require_gt!(a, b)`
 * with no error argument) maps to the framework's generic error.
 */
export function errorRef(errorEnum: string | undefined, code: string, fallback: string): string {
  const variant = code.trim().split("::").pop() ?? "";
  if (!variant) return fallback;
  return errorEnum ? `${errorEnum}::${variant}` : variant;
}
