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
| Action    | Fetch Price, Token Transfer, Jupiter API, Oracle Price, Helius RPC, Token Account Query, Metaplex Asset, Squads Proposal | Fetch data or perform Solana-aware work |
| AI        | AI Agent                                      | Summarize, classify, score risk, or create structured decisions |
| Logic     | If / Else, Wait                               | Branch or delay execution                                       |
| Transform | Filter                                        | Keep only items matching a condition                            |
| Output    | HTTP Request                                  | Send workflow results to another app                            |

## Node Credential Matrix

| Node                 | Credential type                         | Required?                                | Fallback / note                                      |
| -------------------- | --------------------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| Manual Trigger       | None                                    | No                                       | Starts from the Run button                           |
| Cron Trigger         | None                                    | No                                       | Runs only after activation                           |
| Webhook Trigger      | None                                    | No                                       | Header auth is configured on the node itself         |
| Fetch Price          | `birdeye`                               | Required for Birdeye, not DexScreener    | `BIRDEYE_API_KEY` works as an environment fallback   |
| Jupiter API          | `jupiter` plus optional Cloud wallet    | API key optional; wallet required only for direct swap send | `JUPITER_API_KEY` and `JUPITER_API_BASE` can fallback |
| Token Transfer       | Cloud wallet                            | Yes                                      | Uses the selected encrypted Cloud wallet             |
| AI Agent             | `openai`, `anthropic`, or `gemini`      | Required unless env var is configured    | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or `GOOGLE_API_KEY` |
| Oracle Price         | `switchboard` or `webhook` for Switchboard | Required for Switchboard, not Pyth    | Pyth reads can run without an API key                |
| Helius RPC           | `helius`                                | Required unless RPC URL is provided      | API key can build the Helius RPC URL                 |
| Token Account Query  | `helius` or `webhook`                   | Required unless RPC URL is provided      | Supports SPL Token and Token-2022 queries            |
| Metaplex Asset       | `helius`                                | Required unless DAS RPC URL is provided  | Reads asset metadata through DAS-compatible RPC      |
| Squads Proposal      | `squads` or `webhook`                   | Usually required                         | Sends proposal payload to a Squads-compatible API    |
| If / Else            | None                                    | No                                       | Branches on item JSON fields                         |
| Filter               | None                                    | No                                       | Drops non-matching items                             |
| Wait                 | None                                    | No                                       | Delays the item before continuing                    |
| HTTP Request         | `webhook`                               | Optional                                 | Merges bearer token, API key, or custom headers      |

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

## Execution Visibility

The Cloud editor keeps a bottom execution panel open during manual runs.

| Tab        | Shows                                                                 |
| ---------- | --------------------------------------------------------------------- |
| Executions | Each node status: running, completed, failed, waiting, or skipped     |
| Simulation | Risk level, fee estimate, route, blockers, warnings, and wallet deltas |
| Logs       | Runtime messages from the runner and each node                        |
| Output     | JSON output emitted by completed nodes                                |

During a run, nodes and connected edges update on the canvas so the active step is visible while data moves through the workflow.

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

| Node                | Required inputs                   | Key properties                                                  | Emits                                           |
| ------------------- | --------------------------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| Fetch Price         | Optional incoming item            | Token Address, Price Source, Credential                         | `price` and `priceData`                         |
| Token Transfer      | Incoming item or fixed properties | Destination Address, Amount, Token Mint, Source Wallet          | Transaction signature and transfer metadata     |
| Jupiter API         | Incoming item or fixed properties | Operation, Token IDs, Token Search/Tag/Category, Wallet/Taker, Swap Tokens, Credential | Jupiter price/token/portfolio data, swap order/build payloads, or direct swap metadata |
| Oracle Price        | Optional incoming item            | Operation, Provider, Feed ID/Search Query, API URL, Credential  | Oracle price payload or Pyth feed search result |
| Helius RPC          | Optional incoming item            | DAS/RPC Method, Params, RPC URL, Credential                     | JSON-RPC result                                 |
| Token Account Query | Optional incoming item            | Owner, Mint, Token Program, RPC URL, Credential                 | Token account list                              |
| Metaplex Asset      | Optional incoming item            | DAS Operation, Asset/Owner/Group/Creator fields, Display Options, RPC URL, Credential | DAS asset result                    |
| Squads Proposal     | Incoming item or fixed payload    | API URL, Multisig, Title, Payload, Credential                   | Proposal API response                           |

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

### Jupiter API

Jupiter API can run lightweight read operations or prepare swap payloads before a wallet action.

| Operation             | API surface              | Requires wallet?                    | Output                         |
| --------------------- | ------------------------ | ----------------------------------- | ------------------------------ |
| Price API v3          | `GET /price/v3`          | No                                  | Token price payload            |
| Token Search v2       | `GET /tokens/v2/search`  | No                                  | Token metadata/search results  |
| Token Tag v2          | `GET /tokens/v2/tag`     | No                                  | Verified/LST/stocks token list |
| Token Category v2     | `GET /tokens/v2/{category}/{interval}` | No                    | Trending/traded/organic token list |
| Recent Tokens v2      | `GET /tokens/v2/recent`  | No                                  | Jupiter's default recently pooled token list |
| Portfolio Positions   | `GET /portfolio/v1/positions` | Wallet address or selected wallet public key | Position payload       |
| Swap v2 Order         | `GET /swap/v2/order`     | Taker address or selected wallet public key | Quote and assembled order payload |
| Swap v2 Build         | `GET /swap/v2/build`     | Taker address or selected wallet public key | Raw swap instruction payload   |
| Legacy Direct Swap Send | Legacy quote/swap transaction path | Selected Cloud wallet             | Signature, route, and swap metadata |

Use swap operations behind a guard step when the swap depends on external data:

```text
Webhook Trigger -> Fetch Price -> AI Agent -> If / Else -> Jupiter API -> HTTP Request
```

`slippageBps` is basis points. `50` means `0.5%`.

For most first tests, choose `Price API v3`. It does not need a wallet and can run with keyless Jupiter access. For production rate limits, add a Jupiter credential or configure `JUPITER_API_KEY` on the server.

### Oracle Price

Oracle Price reads Pyth Hermes directly, searches Pyth feed IDs, or calls a Switchboard-compatible HTTP endpoint when you provide an API URL and credential.

| Operation         | Provider    | Required fields             | Credential need                         |
| ----------------- | ----------- | --------------------------- | --------------------------------------- |
| Latest Price      | Pyth        | Feed ID                     | None for the public Hermes endpoint     |
| Pyth Feed Search  | Pyth        | Search Query, optional Asset Type | None for the public Hermes endpoint |
| Latest Price      | Switchboard | Feed ID plus API URL template | `switchboard` or `webhook` headers when the endpoint requires auth |

Pyth output includes normalized price, raw price, confidence, exponent, publish time, and the fetch timestamp.

### Helius RPC

Helius RPC is the low-level escape hatch for DAS and Solana JSON-RPC calls. It supports the standard DAS methods `getAsset`, `getAssetBatch`, `getAssetProof`, `getAssetProofBatch`, `getAssetsByAuthority`, `getAssetsByCreator`, `getAssetsByGroup`, `getAssetsByOwner`, `getNftEditions`, `getSignaturesForAsset`, `getTokenAccounts`, and `searchAssets`, plus Solana RPC methods such as `getSignaturesForAddress` and `getTransaction`.

Use Params JSON as the exact JSON-RPC params array. For DAS calls, add a Helius credential or a DAS-compatible RPC URL.

### Metaplex Asset

Metaplex Asset is the guided DAS node for NFT, compressed NFT, and token metadata reads.

| Operation          | Required field                     | Notes                                      |
| ------------------ | ---------------------------------- | ------------------------------------------ |
| Get Asset          | Asset ID                           | Single NFT/token metadata and ownership    |
| Get Asset Proof    | Asset ID                           | Merkle proof for compressed assets         |
| Assets by Owner    | Owner Address                      | Supports pagination and display options    |
| Assets by Group    | Group Key and Group Value          | Use `collection` as the group key for collections |
| Assets by Creator  | Creator Address                    | Optional verified-only filter              |
| Assets by Authority | Authority Address                 | Finds assets controlled by an authority    |
| Search Assets      | Search fields or Advanced Search JSON | Supports token type, owner, creator, group, sorting, and display flags |

This node requires a Helius credential unless you provide another DAS-compatible RPC URL.

### Squads Proposal

Squads Proposal sends a prepared approval payload to your own Squads-compatible API or webhook adapter. Squads v4 itself is SDK/program driven, so this node does not claim to directly create on-chain proposals without an adapter service. Use it to hand off treasury workflow output, transaction summaries, or token-account snapshots into an approval backend.

## AI Agent

AI Agent calls an LLM to process workflow data.

| Property        | Meaning                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| Provider        | OpenAI, Anthropic, or Gemini                                                 |
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
| Cloud wallet           | Token Transfer, Jupiter API direct swap | Used for transaction signing                  |
| Birdeye credential     | Fetch Price                  | Optional when `BIRDEYE_API_KEY` is available  |
| Jupiter credential     | Jupiter API                  | Optional for keyless reads; recommended for production rate limits |
| OpenAI credential      | AI Agent                     | Optional when `OPENAI_API_KEY` is available   |
| Anthropic credential   | AI Agent                     | Optional when `ANTHROPIC_API_KEY` is available |
| Gemini credential      | AI Agent                     | Optional when `GEMINI_API_KEY` or `GOOGLE_API_KEY` is available |
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
| AI-assisted swap guard | `Webhook Trigger -> Fetch Price -> AI Agent -> If / Else -> Jupiter API -> HTTP Request` |
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
