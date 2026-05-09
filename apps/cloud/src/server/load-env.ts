import { existsSync, readFileSync } from "fs";
import { join } from "path";

const NODE_ENV = process.env.NODE_ENV ?? "development";
const isDev = NODE_ENV !== "production";

const envFiles = [
  ".env",
  `.env.${NODE_ENV}`,
  ".env.local",
  `.env.${NODE_ENV}.local`,
];

for (const file of envFiles) {
  loadEnvFile(join(process.cwd(), file), { override: isDev });
}

function loadEnvFile(path: string, options: { override: boolean }) {
  if (!existsSync(path)) return;
  const source = readFileSync(path, "utf8");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (!options.override && process.env[key] !== undefined) continue;
    process.env[key] = parseEnvValue(rawValue);
  }
}

function parseEnvValue(rawValue: string): string {
  let value = rawValue.trim();
  const quote = value[0];
  const isQuoted = (quote === "\"" || quote === "'") && value.endsWith(quote);
  if (isQuoted) {
    value = value.slice(1, -1);
  } else {
    value = value.replace(/\s+#.*$/, "");
  }

  return quote === "\""
    ? value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t")
    : value;
}
