import { Command } from "commander";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { CLI_VERSION } from "../version";

interface CiOptions {
  write?: boolean;
  output?: string;
}

// Workflow for a repo whose Solana project is at the repo root. It installs the
// Solana/Anchor toolchain, runs a local validator for Anchor tests, uploads SARIF to
// code scanning, and fails the job on audit findings or test failures.
export const WORKFLOW = `name: SolStudio CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  security-events: write

jobs:
  solstudio:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install Rust, Solana CLI and Anchor
        run: |
          curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
          echo "$HOME/.cargo/bin" >> "$GITHUB_PATH"
          echo "$HOME/.local/share/solana/install/active_release/bin" >> "$GITHUB_PATH"
          echo "$HOME/.avm/bin" >> "$GITHUB_PATH"
      - name: Show toolchain versions
        run: |
          rustc --version
          solana --version
          anchor --version || echo "anchor not installed (only needed for Anchor projects)"
      - name: Install SolStudio CLI
        run: npm install -g @solstudio/cli@${CLI_VERSION}
      - name: Install JS test dependencies
        if: hashFiles('package.json') != ''
        run: |
          if [ -f yarn.lock ]; then yarn install --frozen-lockfile
          elif [ -f pnpm-lock.yaml ]; then npx pnpm install --frozen-lockfile
          else npm ci || npm install; fi
      - name: Parse project
        run: solstudio parse . --format summary
      - name: Audit project
        id: audit
        continue-on-error: true
        run: solstudio audit . --format sarif --output solstudio-audit.sarif
      - name: Start local validator
        if: hashFiles('Anchor.toml') != ''
        run: |
          solana-keygen new --no-bip39-passphrase --silent --force -o "$HOME/.config/solana/id.json"
          solana config set --url http://127.0.0.1:8899
          solana-test-validator --reset --quiet --ledger "$RUNNER_TEMP/test-ledger" &
          for i in $(seq 1 60); do
            solana cluster-version >/dev/null 2>&1 && exit 0
            sleep 1
          done
          echo "solana-test-validator did not start" >&2
          exit 1
      - name: Run framework tests
        run: solstudio test . --no-setup
      - name: Upload SARIF
        if: always() && hashFiles('solstudio-audit.sarif') != ''
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: solstudio-audit.sarif
      - name: Fail on audit findings
        if: steps.audit.outcome == 'failure'
        run: exit 1
`;

export const ciCommand = new Command("ci")
  .description("Print or write the SolStudio GitHub Actions workflow")
  .option("--write", "Write .github/workflows/solstudio.yml")
  .option("-o, --output <file>", "Write workflow to a custom file")
  .action((options: CiOptions) => {
    if (!options.write && !options.output) {
      console.log(WORKFLOW);
      return;
    }

    const target = resolve(
      options.output ?? join(".github", "workflows", "solstudio.yml"),
    );
    const dir = dirname(target);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(target, WORKFLOW);
    console.log(`Wrote ${target}`);
  });
