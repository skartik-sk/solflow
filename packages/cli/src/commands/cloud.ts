import { Command } from "commander";
import { spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import {
  deleteCloudProfile,
  getActiveCloudProfile,
  getDefaultCloudConfigDir,
  listCloudProfiles,
  redactCloudToken,
  setActiveCloudProfile,
  updateCloudProfile,
  upsertCloudProfile,
} from "../utils/cloud-config";
import { CloudApiError, CloudClient, type WorkflowDefinition } from "../utils/cloud-client";
import {
  buildSelfHostDeployPlan,
  prepareSelfHostDirectory,
  validateSelfHostEnv,
  writeSelfHostFiles,
  type SelfHostDeployStep,
} from "../utils/cloud-self-host";

interface ProfileOption {
  profile?: string;
  json?: boolean;
}

function createClient(options: ProfileOption = {}): CloudClient {
  const profile = getActiveCloudProfile(getDefaultCloudConfigDir(), options.profile);
  if (!profile) {
    throw new Error(
      "No SolStudio Cloud profile configured. Run `solstudio cloud login --endpoint <url> --token <token>` first.",
    );
  }
  return new CloudClient({ endpoint: profile.endpoint, token: profile.token });
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function printWorkflowList(response: any): void {
  const workflows = response.workflows ?? response.items ?? [];
  if (!Array.isArray(workflows) || workflows.length === 0) {
    console.log("No workflows found.");
    return;
  }
  for (const workflow of workflows) {
    console.log(
      `${workflow.id}\t${workflow.status ?? "DRAFT"}\t${workflow.name ?? "Untitled"}\t${workflow.updatedAt ?? ""}`,
    );
  }
}

function printExecutionList(response: any): void {
  const executions = response.executions ?? response.items ?? [];
  if (!Array.isArray(executions) || executions.length === 0) {
    console.log("No executions found.");
    return;
  }
  for (const execution of executions) {
    const workflowName = execution.workflow?.name ? `\t${execution.workflow.name}` : "";
    console.log(
      `${execution.id}\t${execution.status ?? "UNKNOWN"}\t${execution.triggerType ?? "manual"}${workflowName}`,
    );
  }
}

function readJsonFile(path: string): unknown {
  const resolved = resolve(path);
  if (!existsSync(resolved)) throw new Error(`File does not exist: ${resolved}`);
  return JSON.parse(readFileSync(resolved, "utf-8"));
}

function readWorkflowDefinition(path?: string): WorkflowDefinition | undefined {
  if (!path) return undefined;
  return coerceWorkflowDefinition(readJsonFile(path));
}

export function coerceWorkflowDefinition(value: unknown): WorkflowDefinition {
  if (!value || typeof value !== "object") {
    throw new Error("Workflow definition file must contain a JSON object");
  }
  const source = value as { definition?: unknown; workflow?: { definition?: unknown } };
  const candidate = source.workflow?.definition ?? source.definition ?? value;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("Workflow definition must include nodes[] and edges[]");
  }
  const definition = candidate as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(definition.nodes) || !Array.isArray(definition.edges)) {
    throw new Error("Workflow definition must include nodes[] and edges[]");
  }
  return { nodes: definition.nodes, edges: definition.edges };
}

function parseKeyValuePairs(pairs?: string[]): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const pair of pairs ?? []) {
    const index = pair.indexOf("=");
    if (index === -1) throw new Error(`Expected key=value, got ${pair}`);
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!key) throw new Error(`Expected key=value, got ${pair}`);
    output[key] = value;
  }
  return output;
}

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

async function runCloudAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (err) {
    if (err instanceof CloudApiError) {
      console.error(`Cloud API error (${err.status}): ${err.message}`);
    } else {
      console.error(err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }
}

const profileCommand = new Command("profile")
  .description("Manage saved SolStudio Cloud profiles");

profileCommand
  .command("list")
  .description("List configured Cloud profiles")
  .action(() => {
    const profiles = listCloudProfiles();
    const active = getActiveCloudProfile();
    if (profiles.length === 0) {
      console.log("No cloud profiles configured.");
      return;
    }
    for (const profile of profiles) {
      const marker = active?.name === profile.name ? "*" : " ";
      console.log(`${marker} ${profile.name}\t${profile.endpoint}\t${redactCloudToken(profile.token)}`);
    }
  });

profileCommand
  .command("use")
  .description("Switch the active Cloud profile")
  .argument("<name>", "Profile name")
  .action((name: string) => {
    const profile = setActiveCloudProfile(getDefaultCloudConfigDir(), name);
    console.log(`Using SolStudio Cloud profile ${profile.name} (${profile.endpoint}).`);
  });

profileCommand
  .command("set")
  .description("Retarget an existing Cloud profile to another URL/IP or token")
  .argument("<name>", "Profile name")
  .option("--endpoint <url>", "Hosted or self-hosted Cloud URL/IP")
  .option("--token <token>", "Replacement API token")
  .option("--active", "Make this profile active")
  .action((name: string, options: { endpoint?: string; token?: string; active?: boolean }) => {
    try {
      if (!options.endpoint && !options.token && !options.active) {
        throw new Error("Nothing to update. Pass --endpoint, --token, or --active.");
      }
      const profile = updateCloudProfile(getDefaultCloudConfigDir(), name, {
        endpoint: options.endpoint,
        token: options.token,
        makeActive: options.active,
      });
      console.log(`Updated Cloud profile ${profile.name} -> ${profile.endpoint}.`);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const workflowCommand = new Command("workflow")
  .alias("workflows")
  .description("Create, update, run, import, and export Cloud workflows");

workflowCommand
  .command("list")
  .description("List Cloud workflows")
  .option("--profile <name>", "Cloud profile")
  .option("--json", "Print raw JSON")
  .action((options: ProfileOption) =>
    runCloudAction(async () => {
      const response = await createClient(options).listWorkflows();
      options.json ? printJson(response) : printWorkflowList(response);
    }),
  );

workflowCommand
  .command("get")
  .description("Get one Cloud workflow")
  .argument("<id>", "Workflow ID")
  .option("--profile <name>", "Cloud profile")
  .action((id: string, options: ProfileOption) =>
    runCloudAction(async () => {
      printJson(await createClient(options).getWorkflow(id));
    }),
  );

workflowCommand
  .command("create")
  .description("Create a Cloud workflow from CLI arguments or a JSON definition")
  .requiredOption("--name <name>", "Workflow name")
  .option("--description <description>", "Workflow description")
  .option("--definition <file>", "JSON file containing { nodes, edges }")
  .option("--tag <tag>", "Workflow tag; repeatable", collect, [])
  .option("--profile <name>", "Cloud profile")
  .action((options: {
    name: string;
    description?: string;
    definition?: string;
    tag: string[];
    profile?: string;
  }) =>
    runCloudAction(async () => {
      const response = await createClient(options).createWorkflow({
        name: options.name,
        description: options.description,
        definition: readWorkflowDefinition(options.definition),
        tags: options.tag,
      });
      printJson(response);
    }),
  );

workflowCommand
  .command("update")
  .description("Update workflow metadata or graph JSON")
  .argument("<id>", "Workflow ID")
  .option("--name <name>", "Workflow name")
  .option("--description <description>", "Workflow description")
  .option("--definition <file>", "JSON file containing { nodes, edges }")
  .option("--tag <tag>", "Workflow tag; repeatable", collect, [])
  .option("--profile <name>", "Cloud profile")
  .action((id: string, options: {
    name?: string;
    description?: string;
    definition?: string;
    tag: string[];
    profile?: string;
  }) =>
    runCloudAction(async () => {
      const input: Record<string, unknown> = {};
      if (options.name) input.name = options.name;
      if (options.description) input.description = options.description;
      const definition = readWorkflowDefinition(options.definition);
      if (definition) input.definition = definition;
      if (options.tag.length > 0) input.tags = options.tag;
      printJson(await createClient(options).updateWorkflow(id, input));
    }),
  );

workflowCommand
  .command("delete")
  .description("Delete a Cloud workflow")
  .argument("<id>", "Workflow ID")
  .option("--yes", "Confirm deletion")
  .option("--profile <name>", "Cloud profile")
  .action((id: string, options: { yes?: boolean; profile?: string }) =>
    runCloudAction(async () => {
      if (!options.yes) {
        throw new Error("Refusing to delete without --yes.");
      }
      printJson(await createClient(options).deleteWorkflow(id));
    }),
  );

workflowCommand
  .command("activate")
  .description("Activate a Cloud workflow")
  .argument("<id>", "Workflow ID")
  .option("--profile <name>", "Cloud profile")
  .action((id: string, options: ProfileOption) =>
    runCloudAction(async () => {
      printJson(await createClient(options).activateWorkflow(id));
    }),
  );

workflowCommand
  .command("deactivate")
  .description("Deactivate a Cloud workflow")
  .argument("<id>", "Workflow ID")
  .option("--profile <name>", "Cloud profile")
  .action((id: string, options: ProfileOption) =>
    runCloudAction(async () => {
      printJson(await createClient(options).deactivateWorkflow(id));
    }),
  );

workflowCommand
  .command("run")
  .description("Queue a manual Cloud workflow execution")
  .argument("<id>", "Workflow ID")
  .option("--data <file>", "JSON test data file")
  .option("--profile <name>", "Cloud profile")
  .action((id: string, options: { data?: string; profile?: string }) =>
    runCloudAction(async () => {
      printJson(await createClient(options).runWorkflow(
        id,
        options.data ? readJsonFile(options.data) : undefined,
      ));
    }),
  );

workflowCommand
  .command("export")
  .description("Export a Cloud workflow definition")
  .argument("<id>", "Workflow ID")
  .requiredOption("--out <file>", "Output JSON file")
  .option("--profile <name>", "Cloud profile")
  .action((id: string, options: { out: string; profile?: string }) =>
    runCloudAction(async () => {
      const workflow = await createClient(options).getWorkflow(id);
      const payload = workflow.workflow ?? workflow;
      writeFileSync(resolve(options.out), JSON.stringify(payload, null, 2));
      console.log(`Exported workflow ${id} to ${resolve(options.out)}.`);
    }),
  );

workflowCommand
  .command("import")
  .description("Import a workflow JSON file into Cloud")
  .argument("<file>", "Workflow JSON file")
  .option("--name <name>", "Override workflow name")
  .option("--profile <name>", "Cloud profile")
  .action((file: string, options: { name?: string; profile?: string }) =>
    runCloudAction(async () => {
      const raw = readJsonFile(file) as any;
      const source = raw.workflow ?? raw;
      const definition = coerceWorkflowDefinition(raw);
      printJson(await createClient(options).createWorkflow({
        name: options.name ?? source.name ?? "Imported workflow",
        description: source.description,
        definition,
        settings: source.settings,
        tags: Array.isArray(source.tags) ? source.tags : [],
      }));
    }),
  );

const executionCommand = new Command("execution")
  .alias("executions")
  .description("Inspect Cloud workflow execution history");

executionCommand
  .command("list")
  .description("List workflow executions")
  .option("--workflow <id>", "Filter by workflow ID")
  .option("--limit <limit>", "Maximum rows", "50")
  .option("--profile <name>", "Cloud profile")
  .option("--json", "Print raw JSON")
  .action((options: { workflow?: string; limit: string; profile?: string; json?: boolean }) =>
    runCloudAction(async () => {
      const response = await createClient(options).listExecutions({
        workflowId: options.workflow,
        limit: Number(options.limit),
      });
      options.json ? printJson(response) : printExecutionList(response);
    }),
  );

executionCommand
  .command("get")
  .description("Get execution detail")
  .argument("<id>", "Execution ID")
  .option("--profile <name>", "Cloud profile")
  .action((id: string, options: ProfileOption) =>
    runCloudAction(async () => {
      printJson(await createClient(options).getExecution(id));
    }),
  );

const credentialCommand = new Command("credential")
  .alias("credentials")
  .description("Manage encrypted Cloud credentials");

credentialCommand
  .command("list")
  .description("List Cloud credentials without exposing secret values")
  .option("--profile <name>", "Cloud profile")
  .action((options: ProfileOption) =>
    runCloudAction(async () => {
      printJson(await createClient(options).listCredentials());
    }),
  );

credentialCommand
  .command("create")
  .description("Create an encrypted Cloud credential")
  .requiredOption("--label <label>", "Credential label")
  .requiredOption("--type <type>", "Credential type")
  .option("--data <file>", "JSON file containing secret fields")
  .option("--set <key=value>", "Secret field; repeatable", collect, [])
  .option("--profile <name>", "Cloud profile")
  .action((options: {
    label: string;
    type: string;
    data?: string;
    set: string[];
    profile?: string;
  }) =>
    runCloudAction(async () => {
      const data = {
        ...(options.data ? (readJsonFile(options.data) as Record<string, unknown>) : {}),
        ...parseKeyValuePairs(options.set),
      };
      printJson(await createClient(options).createCredential({
        label: options.label,
        type: options.type,
        data,
      }));
    }),
  );

credentialCommand
  .command("delete")
  .description("Delete a Cloud credential")
  .argument("<id>", "Credential ID")
  .option("--yes", "Confirm deletion")
  .option("--profile <name>", "Cloud profile")
  .action((id: string, options: { yes?: boolean; profile?: string }) =>
    runCloudAction(async () => {
      if (!options.yes) throw new Error("Refusing to delete without --yes.");
      printJson(await createClient(options).deleteCredential(id));
    }),
  );

const walletCommand = new Command("wallet")
  .alias("wallets")
  .description("Manage encrypted Cloud wallets");

walletCommand
  .command("list")
  .description("List Cloud wallets without exposing private keys")
  .option("--profile <name>", "Cloud profile")
  .action((options: ProfileOption) =>
    runCloudAction(async () => {
      printJson(await createClient(options).listWallets());
    }),
  );

walletCommand
  .command("create")
  .description("Create an encrypted Cloud wallet")
  .requiredOption("--label <label>", "Wallet label")
  .option("--network <network>", "Wallet network: mainnet or devnet", "devnet")
  .option("--profile <name>", "Cloud profile")
  .action((options: { label: string; network: "mainnet" | "devnet"; profile?: string }) =>
    runCloudAction(async () => {
      if (options.network !== "mainnet" && options.network !== "devnet") {
        throw new Error("Wallet network must be mainnet or devnet.");
      }
      printJson(await createClient(options).createWallet({
        label: options.label,
        network: options.network,
      }));
    }),
  );

walletCommand
  .command("delete")
  .description("Delete a Cloud wallet")
  .argument("<id>", "Wallet ID")
  .option("--yes", "Confirm deletion")
  .option("--profile <name>", "Cloud profile")
  .action((id: string, options: { yes?: boolean; profile?: string }) =>
    runCloudAction(async () => {
      if (!options.yes) throw new Error("Refusing to delete without --yes.");
      printJson(await createClient(options).deleteWallet(id));
    }),
  );

const nodesCommand = new Command("nodes")
  .description("Inspect available Cloud node types");

nodesCommand
  .command("list")
  .description("List Cloud node registry entries")
  .option("--profile <name>", "Cloud profile")
  .option("--json", "Print raw JSON")
  .action((options: ProfileOption) =>
    runCloudAction(async () => {
      const response = await createClient(options).listNodes();
      if (options.json) {
        printJson(response);
        return;
      }
      for (const node of response.nodes ?? []) {
        console.log(`${node.type}\t${node.category}\t${node.label}`);
      }
    }),
  );

const selfHostCommand = new Command("self-host")
  .description("Generate, validate, and run a Cloud-only self-host stack");

selfHostCommand
  .command("init")
  .description("Create docker-compose and env templates for SolStudio Cloud")
  .argument("[directory]", "Output directory", "solstudio-cloud-self-host")
  .option("--domain <domain>", "Public domain", "cloud.localhost")
  .option("--image <image>", "Cloud container image")
  .option("--force", "Overwrite existing files")
  .action((directory: string, options: { domain: string; image?: string; force?: boolean }) => {
    try {
      const target = resolve(directory);
      const written = writeSelfHostFiles({
        directory: target,
        domain: options.domain,
        image: options.image,
        force: options.force,
      });
      console.log(`Created SolStudio Cloud self-host kit in ${target}`);
      for (const file of written) console.log(`  ${file}`);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

selfHostCommand
  .command("check")
  .description("Validate a SolStudio Cloud self-host directory before deploy")
  .argument("[directory]", "Self-host directory", "solstudio-cloud-self-host")
  .action((directory: string) => {
    const target = resolve(directory);
    const envPath = resolve(target, ".env");
    if (!existsSync(envPath)) {
      console.error(`Missing ${envPath}. Run \`solstudio cloud self-host deploy ${directory} --domain <domain>\` to generate it.`);
      process.exit(1);
    }
    const report = validateSelfHostEnv(readFileSync(envPath, "utf-8"));
    printSelfHostEnvReport(report);
    if (!report.ok) process.exit(1);
  });

selfHostCommand
  .command("deploy")
  .description("Generate env/config, validate, and start SolStudio Cloud with Docker Compose")
  .argument("[directory]", "Self-host directory", "solstudio-cloud-self-host")
  .option("--domain <domain>", "Public domain or IP for this Cloud instance", "cloud.localhost")
  .option("--image <image>", "Cloud container image")
  .option("--force", "Overwrite generated docker-compose and README files")
  .option("--no-pull", "Skip docker compose pull")
  .option("--dry-run", "Print the deployment plan without running Docker")
  .option("--yes", "Run non-interactively")
  .option("--profile <name>", "Save this endpoint as a Cloud profile when --token is provided")
  .option("--endpoint <url>", "Endpoint to save for --profile. Defaults to https://<domain>")
  .option("--token <token>", "API token to save with --profile after deploy")
  .action((directory: string, options: {
    domain: string;
    image?: string;
    force?: boolean;
    pull?: boolean;
    dryRun?: boolean;
    yes?: boolean;
    profile?: string;
    endpoint?: string;
    token?: string;
  }) =>
    runCloudAction(async () => {
      const target = resolve(directory);
      const prepared = prepareSelfHostDirectory({
        directory: target,
        domain: options.domain,
        image: options.image,
        force: options.force,
        autoEnv: true,
      });
      console.log(`Prepared SolStudio Cloud self-host directory: ${target}`);
      for (const file of prepared.written) console.log(`  wrote ${file}`);
      printSelfHostEnvReport(prepared.report);
      if (!prepared.report.ok) {
        throw new Error(`Fix ${prepared.envPath} before deploying.`);
      }

      const plan = buildSelfHostDeployPlan({ directory: target, pull: options.pull });
      if (options.dryRun) {
        printSelfHostDeployPlan(plan);
        return;
      }

      for (const step of plan) {
        await runSelfHostStep(step);
      }

      const endpoint = options.endpoint ?? `https://${options.domain}`;
      if (options.profile && options.token) {
        const profile = upsertCloudProfile(getDefaultCloudConfigDir(), {
          name: options.profile,
          endpoint,
          token: options.token,
          makeActive: true,
        });
        console.log(`Saved Cloud profile ${profile.name} -> ${profile.endpoint}.`);
      } else if (options.profile) {
        console.log(`Profile ${options.profile} was not saved because --token was not provided.`);
        console.log(`After creating a CLI token, run: solstudio cloud login --profile ${options.profile} --endpoint ${endpoint} --token sst_your_token`);
      }
    }),
  );

selfHostCommand
  .command("status")
  .description("Show Docker Compose status for a self-hosted Cloud stack")
  .argument("[directory]", "Self-host directory", "solstudio-cloud-self-host")
  .action((directory: string) =>
    runCloudAction(async () => {
      await runSelfHostStep({
        label: "Show Cloud stack status",
        command: "docker",
        args: ["compose", "ps"],
        cwd: resolve(directory),
      });
    }),
  );

selfHostCommand
  .command("logs")
  .description("Show Docker Compose logs for a self-hosted Cloud stack")
  .argument("[directory]", "Self-host directory", "solstudio-cloud-self-host")
  .option("-f, --follow", "Follow logs")
  .option("--tail <lines>", "Lines to show", "200")
  .action((directory: string, options: { follow?: boolean; tail: string }) =>
    runCloudAction(async () => {
      const args = ["compose", "logs", "--tail", options.tail];
      if (options.follow) args.push("-f");
      await runSelfHostStep({
        label: "Show Cloud stack logs",
        command: "docker",
        args,
        cwd: resolve(directory),
      });
    }),
  );

export const cloudCommand = new Command("cloud")
  .description("Control SolStudio Cloud from the terminal");

cloudCommand
  .command("login")
  .description("Save a hosted or self-hosted SolStudio Cloud API token")
  .option("--endpoint <url>", "Cloud endpoint", "https://cloud.solstudio.fun")
  .option("--token <token>", "Cloud API token. Can also use SOLSTUDIO_CLOUD_TOKEN.")
  .option("--profile <name>", "Profile name", "default")
  .option("--no-verify", "Store the token without calling whoami")
  .action((options: { endpoint: string; token?: string; profile: string; verify?: boolean }) =>
    runCloudAction(async () => {
      const token = options.token ?? process.env.SOLSTUDIO_CLOUD_TOKEN;
      if (!token) {
        throw new Error("Missing token. Pass --token or set SOLSTUDIO_CLOUD_TOKEN.");
      }
      if (options.verify !== false) {
        await new CloudClient({ endpoint: options.endpoint, token }).whoami();
      }
      const profile = upsertCloudProfile(getDefaultCloudConfigDir(), {
        name: options.profile,
        endpoint: options.endpoint,
        token,
        makeActive: true,
      });
      console.log(`Logged in to ${profile.endpoint} as profile ${profile.name}.`);
    }),
  );

cloudCommand
  .command("logout")
  .description("Remove a saved Cloud profile")
  .argument("[profile]", "Profile name")
  .action((profile?: string) => {
    const active = getActiveCloudProfile();
    const name = profile ?? active?.name;
    if (!name) {
      console.log("No cloud profile configured.");
      return;
    }
    const deleted = deleteCloudProfile(getDefaultCloudConfigDir(), name);
    console.log(deleted ? `Removed Cloud profile ${name}.` : `Cloud profile not found: ${name}`);
  });

cloudCommand
  .command("whoami")
  .description("Show authenticated Cloud user")
  .option("--profile <name>", "Cloud profile")
  .action((options: ProfileOption) =>
    runCloudAction(async () => {
      printJson(await createClient(options).whoami());
    }),
  );

cloudCommand
  .command("status")
  .description("Check Cloud service health")
  .option("--profile <name>", "Cloud profile")
  .action((options: ProfileOption) =>
    runCloudAction(async () => {
      printJson(await createClient(options).health());
    }),
  );

cloudCommand
  .command("agent")
  .description("Print LLM/agent instructions for using the Cloud CLI")
  .action(() => {
    console.log([
      "SolStudio Cloud agent usage:",
      "1. Run `solstudio cloud whoami` to verify the active profile.",
      "2. Use `solstudio cloud nodes list` before creating workflows so node types match the server.",
      "3. Create graph JSON with `{ \"nodes\": [], \"edges\": [] }`, then run `solstudio cloud workflow create --name <name> --definition workflow.json`.",
      "4. Store provider keys with `solstudio cloud credential create`; never write secrets into workflow JSON.",
      "5. Use `solstudio cloud workflow run <id>` for manual execution and `solstudio cloud execution get <id>` for logs.",
      "6. For self-hosted Cloud, run `solstudio cloud self-host deploy ./solstudio-cloud --domain <domain>` and log in with that endpoint.",
    ].join("\n"));
  });

cloudCommand.addCommand(profileCommand);
cloudCommand.addCommand(workflowCommand);
cloudCommand.addCommand(executionCommand);
cloudCommand.addCommand(credentialCommand);
cloudCommand.addCommand(walletCommand);
cloudCommand.addCommand(nodesCommand);
cloudCommand.addCommand(selfHostCommand);

function printSelfHostEnvReport(report: {
  ok: boolean;
  missing: string[];
  placeholder: string[];
  warnings: string[];
}): void {
  if (report.ok) {
    console.log("Self-host env check passed.");
  } else {
    if (report.missing.length > 0) {
      console.error(`Missing env keys: ${report.missing.join(", ")}`);
    }
    if (report.placeholder.length > 0) {
      console.error(`Placeholder env keys: ${report.placeholder.join(", ")}`);
    }
  }
  for (const warning of report.warnings) console.warn(`Warning: ${warning}`);
}

function printSelfHostDeployPlan(plan: SelfHostDeployStep[]): void {
  for (const step of plan) {
    console.log(`[${step.label}] ${step.command} ${step.args.join(" ")}`);
  }
}

function runSelfHostStep(step: SelfHostDeployStep): Promise<void> {
  console.log(`[${step.label}] ${step.command} ${step.args.join(" ")}`);
  return new Promise((resolveStep, rejectStep) => {
    const child = spawn(step.command, step.args, {
      cwd: step.cwd,
      stdio: "inherit",
    });
    child.on("error", rejectStep);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveStep();
      } else {
        rejectStep(new Error(`${step.label} failed with exit code ${code ?? "unknown"}`));
      }
    });
  });
}
