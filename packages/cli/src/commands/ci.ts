import { Command } from "commander";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";

interface CiOptions {
  write?: boolean;
  output?: string;
}

const WORKFLOW = `name: SolStudio CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  solstudio:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install SolStudio CLI
        run: npm install -g @solstudio/cli@latest
      - name: Parse project
        run: solstudio parse .
      - name: Audit project
        id: audit
        continue-on-error: true
        run: solstudio audit . --format sarif --output solstudio-audit.sarif
      - name: Run framework tests
        if: always()
        run: solstudio test . --no-setup
      - name: Upload SARIF
        if: always()
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
