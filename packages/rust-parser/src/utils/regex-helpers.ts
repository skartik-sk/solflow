// Regex helpers — comment stripping, bracket matching, string extraction.

/**
 * Strip line (//) and block comments from Rust source, preserving /// doc comments.
 */
export function stripComments(src: string): string {
  // Process character-by-character to handle comments inside strings correctly.
  let out = "";
  let i = 0;
  while (i < src.length) {
    // String literals — skip them entirely (don't strip "comments" inside strings)
    if (src[i] === '"') {
      const start = i;
      i++; // skip opening quote
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\") i++; // skip escaped char
        i++;
      }
      i++; // skip closing quote
      out += src.slice(start, i);
      continue;
    }

    // Raw string literals r"..." or r#"..."#
    if (src[i] === "r" && (src[i + 1] === '"' || src[i + 1] === "#")) {
      const start = i;
      i += 2;
      if (src[start + 1] === "#") {
        // count hashes for r###"..."###
        let hashes = 1;
        while (i < src.length && src[i] === "#") { hashes++; i++; }
        i++; // skip opening quote
        while (i < src.length) {
          if (src[i] === '"') {
            i++;
            let h = 0;
            while (h < hashes && i < src.length && src[i] === "#") { h++; i++; }
            if (h === hashes) break;
          } else {
            i++;
          }
        }
      } else {
        i++; // skip opening quote
        while (i < src.length && src[i] !== '"') i++;
        i++; // skip closing quote
      }
      out += src.slice(start, i);
      continue;
    }

    // /// doc comments — keep them (they may contain descriptions)
    if (src[i] === "/" && src[i + 1] === "/" && src[i + 2] === "/") {
      const start = i;
      while (i < src.length && src[i] !== "\n") i++;
      out += src.slice(start, i);
      continue;
    }

    // // line comments — strip
    if (src[i] === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }

    // /* block comments — strip (but keep any inner content for context)
    if (src[i] === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length - 1 && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2; // skip */
      continue;
    }

    out += src[i];
    i++;
  }
  return out;
}

/**
 * Extract a balanced { } block starting from the given position.
 * Returns the content inside the braces (excluding the braces themselves)
 * and the position after the closing brace.
 */
export function extractBalancedBlock(
  src: string,
  startPos: number,
  openChar = "{",
  closeChar = "}",
): { content: string; endPos: number } | null {
  // Find the opening brace
  let pos = startPos;
  while (pos < src.length && src[pos] !== openChar) pos++;
  if (pos >= src.length) return null;

  const contentStart = pos + 1;
  let depth = 1;
  pos++;

  while (pos < src.length && depth > 0) {
    // Skip string literals
    if (src[pos] === '"') {
      pos++;
      while (pos < src.length && src[pos] !== '"') {
        if (src[pos] === "\\") pos++;
        pos++;
      }
      pos++;
      continue;
    }
    if (src[pos] === openChar) depth++;
    else if (src[pos] === closeChar) depth--;
    pos++;
  }

  return {
    content: src.slice(contentStart, pos - 1),
    endPos: pos,
  };
}

/**
 * Extract a balanced ( ) block starting from the given position.
 */
export function extractParens(
  src: string,
  startPos: number,
): { content: string; endPos: number } | null {
  return extractBalancedBlock(src, startPos, "(", ")");
}

/**
 * Extract text from a /// doc comment line.
 * Returns the trimmed description text (without the /// prefix).
 */
export function extractDocComment(line: string): string | undefined {
  const match = line.match(/^\/\/\/\s*(.*)/);
  return match ? match[1].trim() : undefined;
}

/**
 * Collect consecutive /// doc comments immediately before a given position.
 */
export function collectDocComments(src: string, beforePos: number): string {
  const lines = src.slice(0, beforePos).split("\n");
  const docLines: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    const doc = extractDocComment(trimmed);
    if (doc !== undefined) {
      docLines.unshift(doc);
    } else if (trimmed === "") {
      continue; // skip blank lines between doc comments
    } else {
      break;
    }
  }
  return docLines.join(" ");
}
