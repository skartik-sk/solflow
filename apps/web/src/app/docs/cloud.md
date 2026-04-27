# Cloud Platform Reference

SolStudio Cloud is the workflow automation platform. Instead of generating Rust, Cloud runs connected workflow nodes: triggers start executions, actions call Solana-aware services, logic routes items, and outputs send results to another system.

Want practice instead of reference reading? Open the [Cloud Learning Path](/docs/learn/cloud) and build the price monitor, swap guard, and manual payout exercises.

---

## Mental Model

A Cloud workflow is a directed graph of nodes. Each node receives workflow items, reads configured properties, emits new workflow items, and records execution logs.

| Concept   | Meaning                                                              |
| --------- | -------------------------------------------------------------------- |
| Workflow  | A saved graph of nodes and edges                                     |
| Trigger   | A node that creates the first item in an execution                   |
| Action    | A node that does work: fetch data, call AI, transfer tokens, or swap |
| Item      | JSON data passed between nodes                                       |
| Property  | Node configuration such as token, amount, prompt, URL, or wallet     |
| Execution | One run of the workflow                                              |
| Log       | Per-node runtime output for debugging and audit                      |

Cloud is for automation. Use the visual builder when you need generated Solana program code. Use Cloud when you need cron jobs, webhook intake, AI decisions, token transfers, swaps, or external notifications.

## Node Families

| Family    | Nodes                                         | Use                                                             |
| --------- | --------------------------------------------- | --------------------------------------------------------------- |
| Trigger   | Manual Trigger, Cron Trigger, Webhook Trigger | Start a workflow run                                            |
| Action    | Fetch Price, Token Transfer, Jupiter Swap     | Fetch data or perform Solana-aware work                         |
| AI        | AI Agent                                      | Summarize, classify, score risk, or create structured decisions |
| Logic     | If / Else, Wait                               | Branch or delay execution                                       |
| Transform | Filter                                        | Keep only items matching a condition                            |
| Output    | HTTP Request                                  | Send workflow results to another app                            |

## Connection Rules

Cloud connections carry typed data between node handles.

| Source category | Can connect to                       |
| --------------- | ------------------------------------ |
| Trigger         | Action, Transform, Logic, AI, Output |
| Action          | Action, Transform, Logic, AI, Output |
| Transform       | Action, Transform, Logic, AI, Output |
| Logic           | Action, Transform, Logic, AI, Output |
| AI              | Action, Transform, Logic, AI, Output |
| Output          | Nothing                              |

Port types:

| Port type | Color  | Meaning                                                   |
| --------- | ------ | --------------------------------------------------------- |
| `main`    | Blue   | Normal workflow item data                                 |
| `ai`      | Purple | AI-specific connection type that can also feed main ports |
| `trigger` | Green  | Trigger source data that can feed main ports              |

Important rules:

- Trigger nodes are source nodes. They do not receive normal inputs.
- Output nodes finish a branch. They should not have outgoing connections.
- Most workflow paths should read left to right: trigger, data/action, AI or logic, risky action, output.
- Wallet actions should usually sit behind an explicit `If / Else` when the decision depends on AI or external data.

## Workflow Item Data

Nodes pass arrays of items. Each item has a JSON object:

```json
{
  "json": {
    "token": "SOL",
    "price": 142.12,
    "alert": true
  }
}
```

Most action nodes merge their result into the incoming item. For example, Fetch Price can receive `{ "token": "SOL" }` and emit the same item with `price` and `priceData` attached.

## Expressions

Expression fields can reference data from the current item.

| Expression              | Meaning                                             |
| ----------------------- | --------------------------------------------------- |
| `{{ $json.token }}`     | Read `token` from the current item                  |
| `{{ $json.amount }}`    | Read `amount` from the current item                 |
| `{{ $json.signature }}` | Read a transaction signature from a previous action |
| `{{ $json }}`           | Pass the full item JSON object                      |

Use expressions when a value should come from an earlier node instead of being hard-coded in the properties panel.

## Trigger Nodes

| Node            | Expected input | Expected output                                | Use when                                                    |
| --------------- | -------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| Manual Trigger  | None           | A single manual run item                       | Testing, admin actions, operator-controlled payouts         |
| Cron Trigger    | None           | A scheduled trigger item with timestamp data   | Price checks, reports, recurring monitoring                 |
| Webhook Trigger | HTTP request   | Request body, headers, method, path, and query | Bots, backend events, alerting tools, external integrations |

### Manual Trigger

Manual Trigger has no required properties and no inputs. It starts when the user clicks Run.

Use it for first tests, one-off operations, and workflows that should not run automatically.

### Cron Trigger

Cron Trigger starts a workflow on a recurring schedule.

| Property        | Meaning                                                 |
| --------------- | ------------------------------------------------------- |
| Cron Expression | Standard 5-field cron expression, such as `*/5 * * * *` |
| Timezone        | Timezone used for the schedule                          |

Use Cron Trigger for monitoring and reporting. Keep the schedule conservative until you have reviewed execution logs.

### Webhook Trigger

Webhook Trigger starts a workflow from an HTTP request.

| Property          | Meaning                                          |
| ----------------- | ------------------------------------------------ |
| HTTP Method       | `GET`, `POST`, `PUT`, or `ANY`                   |
| Custom Path       | Optional path suffix for the webhook URL         |
| Authentication    | None or header authentication                    |
| Auth Header Name  | Header name to check when header auth is enabled |
| Replay Protection | Requires timestamp and signature headers         |
| Max Body KB       | Rejects oversized request bodies                 |
| Response Code     | Immediate HTTP status code                       |

Use Webhook Trigger when another product, bot, backend, or alerting system should start the run.

## Action Nodes

| Node           | Required inputs                   | Key properties                                                  | Emits                                           |
| -------------- | --------------------------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| Fetch Price    | Optional incoming item            | Token Address, Price Source, Credential                         | `price` and `priceData`                         |
| Token Transfer | Incoming item or fixed properties | Destination Address, Amount, Token Mint, Source Wallet          | Transaction signature and transfer metadata     |
| Jupiter Swap   | Incoming item or fixed properties | Input Token, Output Token, Amount, Slippage, Wallet, Credential | Transaction signature, route, and swap metadata |

### Fetch Price

Fetch Price gets token price data from Birdeye or DexScreener.

Use it before AI, If / Else, alerts, and swap guards.

Example connection:

```text
Cron Trigger -> Fetch Price -> If / Else -> HTTP Request
```

### Token Transfer

Token Transfer sends SOL or SPL tokens from a selected Cloud wallet.

Use it only after confirming:

- The destination address is correct.
- The amount is in the expected unit.
- The selected wallet is the intended signing wallet.
- A manual test run produced the expected signature output.

Example connection:

```text
Manual Trigger -> Token Transfer -> HTTP Request
```

### Jupiter Swap

Jupiter Swap executes a token swap through Jupiter.

Use it behind a guard step when the swap depends on external data:

```text
Webhook Trigger -> Fetch Price -> AI Agent -> If / Else -> Jupiter Swap -> HTTP Request
```

`slippageBps` is basis points. `50` means `0.5%`.

## AI Agent

AI Agent calls an LLM to process workflow data.

| Property        | Meaning                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| Provider        | OpenAI or Anthropic                                                         |
| Credential      | Optional provider credential. Environment variables can be used as fallback |
| Model           | Selected model                                                              |
| System Prompt   | Instruction that sets the agent behavior                                    |
| User Prompt     | Prompt content, often using expressions                                     |
| Temperature     | Lower for deterministic decisions, higher for creative text                 |
| Max Tokens      | Response length limit                                                       |
| Response Format | Plain text or JSON object                                                   |

Prefer JSON output when the next node is `If / Else`. For example:

```text
Return { "approved": boolean, "reason": string }
```

Then branch on `approved`.

## Logic And Transform Nodes

| Node      | Purpose                                   | Key properties                 | Output                     |
| --------- | ----------------------------------------- | ------------------------------ | -------------------------- |
| If / Else | Routes items into true and false branches | Field, Operator, Compare Value | `true` and `false` outputs |
| Wait      | Pauses execution                          | Duration, Unit                 | Same item after delay      |
| Filter    | Drops non-matching items                  | Field, Condition, Value        | `matched` output           |

Use `If / Else` when the false path still matters. Use `Filter` when non-matching items should stop silently.

Common operators:

| Operator           | Use                                          |
| ------------------ | -------------------------------------------- |
| `eq` / `neq`       | Exact match or mismatch                      |
| `gt` / `gte`       | Numeric threshold checks                     |
| `lt` / `lte`       | Numeric ceiling checks                       |
| `truthy` / `falsy` | Boolean-style checks from AI or webhook data |
| `exists`           | Filter only items with a field present       |
| `contains`         | Filter text or array values                  |

## Output Nodes

HTTP Request, also shown in learning materials as Webhook Output, sends data to another system.

| Property   | Meaning                                       |
| ---------- | --------------------------------------------- |
| URL        | Destination URL                               |
| Method     | `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`    |
| Headers    | JSON object of request headers                |
| Credential | Optional auth headers merged into the request |
| Body       | Expression or JSON body                       |
| Timeout    | Maximum request time                          |

Example body:

```text
{{ $json.signature }}
```

Example full-item body:

```text
{{ $json }}
```

## Wallets And Credentials

Cloud workflows can use encrypted wallets and credentials for automated actions.

| Resource               | Used by                      | Notes                                         |
| ---------------------- | ---------------------------- | --------------------------------------------- |
| Cloud wallet           | Token Transfer, Jupiter Swap | Used for transaction signing                  |
| Birdeye credential     | Fetch Price                  | Optional when `BIRDEYE_API_KEY` is available  |
| Jupiter credential     | Jupiter Swap                 | Optional when `JUPITER_API_KEY` is available  |
| AI provider credential | AI Agent                     | Optional when provider env vars are available |
| Webhook credential     | HTTP Request                 | Merged into outbound request headers          |

Operational rules:

- Use a dedicated wallet per automation class.
- Keep wallet balances limited to what the workflow needs.
- Put AI or webhook approvals behind explicit branch nodes before wallet actions.
- Review execution logs after every activation.

## Common Workflow Patterns

| Pattern                | Graph                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Scheduled market alert | `Cron Trigger -> Fetch Price -> If / Else -> HTTP Request`                                |
| AI price monitor       | `Cron Trigger -> Fetch Price -> AI Agent -> If / Else -> HTTP Request`                    |
| Manual payout          | `Manual Trigger -> Token Transfer -> Filter -> HTTP Request`                              |
| AI-assisted swap guard | `Webhook Trigger -> Fetch Price -> AI Agent -> If / Else -> Jupiter Swap -> HTTP Request` |
| Delayed follow-up      | `Manual Trigger -> Wait -> HTTP Request`                                                  |

## Cloud Versus Other Surfaces

| Question                                              | Use Visual Builder | Use CLI                               | Use Cloud |
| ----------------------------------------------------- | ------------------ | ------------------------------------- | --------- |
| Am I creating an on-chain Solana program?             | Yes                | Maybe, for inspection                 | No        |
| Do I need generated Rust code?                        | Yes                | Maybe, for local source understanding | No        |
| Do I need to inspect an existing local project?       | No                 | Yes                                   | No        |
| Do I need cron, webhooks, wallets, or AI automations? | No                 | No                                    | Yes       |
| Do I need a workflow to keep running?                 | No                 | No                                    | Yes       |

## Activation Checklist

- The workflow has exactly one trigger path you understand.
- Every wallet action uses the intended wallet.
- AI output is structured when logic needs to branch on it.
- Every risky action sits after an explicit guard step.
- Webhook URLs, headers, and credentials are configured.
- A manual test run produced the expected execution log.
- The final output node reports enough data to debug failed runs.

## Common Fixes

| Problem                         | Fix                                                                      |
| ------------------------------- | ------------------------------------------------------------------------ |
| Workflow never starts           | Check trigger type, schedule, webhook path, and activation state         |
| Webhook request is rejected     | Check method, custom path, auth header, replay protection, and body size |
| Fetch Price fails with Birdeye  | Add a Birdeye credential or configure `BIRDEYE_API_KEY`                  |
| AI branch never takes true path | Return JSON from AI Agent and branch on the exact field name             |
| Swap or transfer fails          | Check wallet, amount unit, token mint, balance, and execution logs       |
| Output request fails            | Check URL, method, headers, body expression, credential, and timeout     |
