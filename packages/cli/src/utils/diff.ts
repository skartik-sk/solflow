// Minimal unified diff (single hunk) used by `patch` and the local sync preview.

export function createUnifiedDiff(
  path: string,
  oldContent: string | null,
  newContent: string,
): string {
  if (oldContent === newContent) return "";
  const oldLines = oldContent == null ? [] : splitLines(oldContent);
  const newLines = splitLines(newContent);
  const header = [
    `diff --git a/${path} b/${path}`,
    // git apply needs the mode line to treat --- /dev/null as a file creation
    ...(oldContent == null ? ["new file mode 100644", "--- /dev/null"] : [`--- a/${path}`]),
    `+++ b/${path}`,
  ];

  if (oldContent == null) {
    return [
      ...header,
      `@@ -0,0 +1,${newLines.length} @@`,
      ...newLines.map((line) => `+${line}`),
    ].join("\n");
  }

  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix++;
  }

  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (
    oldEnd >= prefix &&
    newEnd >= prefix &&
    oldLines[oldEnd] === newLines[newEnd]
  ) {
    oldEnd--;
    newEnd--;
  }

  const context = 3;
  const start = Math.max(0, prefix - context);
  const oldLimit = Math.min(oldLines.length - 1, oldEnd + context);
  const newLimit = Math.min(newLines.length - 1, newEnd + context);
  const oldCount = oldLimit >= start ? oldLimit - start + 1 : 0;
  const newCount = newLimit >= start ? newLimit - start + 1 : 0;
  const hunk: string[] = [
    `@@ -${start + 1},${oldCount} +${start + 1},${newCount} @@`,
  ];

  for (let i = start; i < prefix; i++) hunk.push(` ${oldLines[i]}`);
  for (let i = prefix; i <= oldEnd; i++) hunk.push(`-${oldLines[i]}`);
  for (let i = prefix; i <= newEnd; i++) hunk.push(`+${newLines[i]}`);
  for (let i = Math.max(prefix, oldEnd + 1); i <= oldLimit; i++) {
    hunk.push(` ${oldLines[i]}`);
  }

  return [...header, ...hunk].join("\n");
}

function splitLines(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}
