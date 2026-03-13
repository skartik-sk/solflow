// Tiny browser-safe hash utility.
// Uses djb2 (fast, deterministic, no crypto APIs needed in browser).
// Server-side could swap this for actual SHA-256 from Node crypto if needed.

function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Return as unsigned hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export default { hash: djb2 };
