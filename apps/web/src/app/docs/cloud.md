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

| Family    | Nodes                                                                                                                                                                                                        | Use                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Trigger   | Manual Trigger, Cron Trigger, Webhook Trigger                                                                                                                                                                | Start a workflow run                                            |
| Action    | Fetch Price, Token Transfer, Jupiter Price/Token/Swap nodes, Solana RPC, Custom API Request, Pyth Price/Search/Latest Prices, Helius activity/transaction/enhanced-history/webhook nodes, Jito bundle nodes, Discord/Telegram/Dialect notification nodes, Token Account Query, Metaplex asset nodes, Squads Proposal, Umbra nodes | Fetch data or perform Solana-aware work                         |
| AI        | AI Agent                                                                                                                                                                                                     | Summarize, classify, score risk, or create structured decisions |
| Logic     | If / Else, Wait                                                                                                                                                                                              | Branch or delay execution                                       |
| Transform | Filter                                                                                                                                                                                                       | Keep only items matching a condition                            |
| Output    | Display Output, Run Log, Workflow Result, HTTP Request                                                                                                                                                       | Show run results or send them to another app                    |

## Node Credential Matrix

| Node                                         | Credential type                      | Required?                                                       | Fallback / note                                                                |
| -------------------------------------------- | ------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Manual Trigger                               | None                                 | No                                                              | Starts from the Run button                                                     |
| Cron Trigger                                 | None                                 | No                                                              | Runs only after activation                                                     |
| Webhook Trigger                              | None                                 | No                                                              | Header auth is configured on the node itself                                   |
| Fetch Price                                  | `birdeye`                            | Required for Birdeye, not DexScreener                           | `BIRDEYE_API_KEY` works as an environment fallback                             |
| Jupiter Price / Token / Swap nodes           | `jupiter` plus optional Cloud wallet | API key optional; wallet required for execute/direct swap nodes | `JUPITER_API_KEY` and `JUPITER_API_BASE` can fallback                          |
| Token Transfer                               | Cloud wallet                         | Yes                                                             | Uses the selected encrypted Cloud wallet                                       |
| AI Agent                                     | `openai`, `anthropic`, or `gemini`   | Required unless env var is configured                           | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or `GOOGLE_API_KEY`   |
| Pyth Price / Feed Search / Latest Prices     | None                                 | No                                                              | Uses public Pyth Hermes endpoints                                              |
| Switchboard Price                            | `switchboard` or `webhook`           | Required unless API URL is provided                             | Reads a Switchboard-compatible endpoint                                        |
| Helius activity / JSON-RPC transaction nodes | `helius`                             | Required unless RPC URL is provided                             | API key can build the Helius RPC URL                                           |
| Helius enhanced parse / address history      | `helius`                             | Yes                                                             | Uses the Enhanced Transactions API with `api-key`                              |
| Helius Webhook Create / List / Delete         | `helius`                             | Yes                                                             | Creates and manages realtime event webhooks                                    |
| Jito Tip / Bundle nodes                       | `jito`                               | Optional for public/default limits                              | Auth UUID can be saved for authenticated limits                                |
| Discord Message                               | `discord`                            | Required unless Webhook URL is pasted on the node                | Mentions are disabled by default                                               |
| Telegram Message                              | `telegram`                           | Yes                                                             | Stores bot token server-side                                                   |
| Dialect Alert                                 | `dialect`                            | Yes                                                             | Uses the Dialect Alerts REST API                                               |
| Token Account Query                          | `helius` or `webhook`                | Required unless RPC URL is provided                             | Supports SPL Token and Token-2022 queries                                      |
| Metaplex asset nodes                         | `helius`                             | Required unless DAS RPC URL is provided                         | Reads DAS asset, proof, owner, collection, creator, authority, and search data |
| Squads Proposal                              | `squads` or `webhook`                | Usually required                                                | Sends proposal payload to a Squads-compatible API                              |
| Umbra Indexer / Relayer / Transfer Plan      | Cloud wallet for transfer handoff    | Wallet required for final SDK execution                         | Health/info calls use Umbra public endpoints; transfer node emits a handoff plan |
| Solana RPC                                   | `rpcfast`, `helius`, `quicknode`, `alchemy`, `triton`, or `webhook` | No for public RPC; yes for private providers | Calls standard Solana JSON-RPC methods                                         |
| Custom API Request                           | `webhook`                            | Optional                                                        | Calls any HTTPS API and passes the response forward                            |
| If / Else                                    | None                                 | No                                                              | Branches on item JSON fields                                                   |
| Filter                                       | None                                 | No                                                              | Drops non-matching items                                                       |
| Wait                                         | None                                 | No                                                              | Delays the item before continuing; wait is capped for worker safety            |
| Display Output                               | None                                 | No                                                              | Shows a value in run output without calling another service                    |
| Run Log                                      | None                                 | No                                                              | Writes a value into the run logs and node output                               |
| Workflow Result                              | None                                 | No                                                              | Marks the final branch result for easy inspection                              |
| HTTP Request                                 | `webhook`                            | Optional                                                        | Merges bearer token, API key, or custom headers                                |

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

The Cloud editor keeps a bottom execution rail visible. Open it to inspect runs, preflight checks, logs, and node JSON output.

| Tab       | Shows                                                                    |
| --------- | ------------------------------------------------------------------------ |
| Runs      | Each node status: running, completed, failed, waiting, or skipped        |
| Preflight | Risk level, fee estimate, route, blockers, warnings, and wallet deltas   |
| Logs      | Runtime messages from the runner and each node                           |
| Output    | Per-node inspector for output, input, errors, logs, timing, and raw JSON |

During a run, nodes and connected edges update on the canvas so the active step is visible while data moves through the workflow.

Preflight checks the saved graph, route, credentials, wallet actions, fee estimate, warnings, and blockers. It does not call provider APIs, sign transactions, or send webhooks. Run performs preflight first, then queues and executes the workflow if it is not blocked.

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

| Node                                                                           | Required inputs                    | Key properties                                                                        | Emits                                          |
| ------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Fetch Price                                                                    | Optional incoming item             | Token Address, Price Source, Credential                                               | `price` and `priceData`                        |
| Token Transfer                                                                 | Incoming item or fixed properties  | Destination Address, Amount, Token Mint, Source Wallet                                | Transaction signature and transfer metadata    |
| Jupiter Price                                                                  | Incoming item or fixed token IDs   | Token IDs, Credential                                                                 | Jupiter price payload                          |
| Jupiter Token Search / Tag / Category / Recent                                 | Incoming item or fixed properties  | Search, Tag, Category, Interval, Limit, Credential                                    | Jupiter token metadata lists                   |
| Jupiter Portfolio                                                              | Wallet address or selected wallet  | Wallet Address, Wallet, Credential                                                    | Jupiter portfolio positions                    |
| Jupiter Swap Order / Build                                                     | Taker address or selected wallet   | Input Token, Output Token, Amount, Slippage, Credential                               | Jupiter order/build payload                    |
| Jupiter Swap Execute                                                           | Prepared Jupiter order transaction | Order Transaction, Request ID, Wallet, Credential                                     | Execute status and signature                   |
| Jupiter Direct Swap                                                            | Selected Cloud wallet              | Input Token, Output Token, Amount, Slippage, Wallet, Credential                       | V2 order, execute status, route, and signature |
| Pyth Price / Feed Search / Latest Prices                                       | Optional incoming item             | Feed ID, Feed IDs, or Search, Asset Type                                              | Price payloads or feed search result           |
| Switchboard Price                                                              | Optional incoming item             | Feed ID, API URL, Credential                                                          | Endpoint response                              |
| Helius Wallet Activity / Transaction / Enhanced History                        | Optional incoming item             | Wallet Address, Signature, filters, RPC URL, Credential                               | JSON-RPC or enhanced transaction result        |
| Helius Webhook Create / List / Delete                                          | Optional incoming item             | Webhook URL, Webhook Type, Addresses, Transaction Types, Credential                    | Helius webhook response                        |
| Jito Tip Accounts / Bundle Status / Send Bundle / Tip Floor                    | Optional incoming item             | Region, Bundle IDs, Signed Transactions, Credential                                   | Jito tip or bundle response                    |
| Discord / Telegram / Dialect notification nodes                                | Optional incoming item             | Webhook URL or Credential, Message, Chat/App/Recipient fields                          | Notification response                          |
| Token Account Query                                                            | Optional incoming item             | Owner, Mint, Token Program, RPC URL, Credential                                       | Token account list                             |
| Metaplex Get Asset / Proof / Owner / Collection / Creator / Authority / Search | Optional incoming item             | Asset ID, Owner, Creator, Authority, Collection, Display Options, RPC URL, Credential | DAS asset results                              |
| Squads Proposal                                                                | Incoming item or fixed payload     | API URL, Multisig, Title, Payload, Credential                                         | Proposal API response                          |
| Umbra Indexer Health / Relayer Info / Transfer Plan                            | Optional incoming item             | Network, Recipient, Mint, Amount, Wallet, Endpoint overrides                          | Service health/info or private transfer plan   |
| Solana RPC                                                                     | Optional incoming item             | Provider, RPC URL, Credential, Method, Params JSON                                    | `solanaRpc` result payload                     |
| Custom API Request                                                             | Optional incoming item             | URL, Method, Headers, Credential, Body, Output Field                                  | Custom response field                          |

### Fetch Price

Fetch Price gets token price data from Birdeye or DexScreener.

Use it before AI, If / Else, alerts, and swap guards.

Example connection:

```text
Cron Trigger -> Fetch Price -> If / Else -> Run Log
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
Manual Trigger -> Token Transfer -> Workflow Result
```

### Jupiter Nodes

Jupiter features are split into separate nodes so each workflow step only shows the settings it needs.

| Node                   | API surface                                    | Requires wallet?                             | Output                                        |
| ---------------------- | ---------------------------------------------- | -------------------------------------------- | --------------------------------------------- |
| Jupiter Price          | `GET /price/v3`                                | No                                           | Token price payload                           |
| Jupiter Token Search   | `GET /tokens/v2/search`                        | No                                           | Token metadata/search results                 |
| Jupiter Token Tag      | `GET /tokens/v2/tag`                           | No                                           | Verified/LST/stocks token list                |
| Jupiter Token Category | `GET /tokens/v2/{category}/{interval}`         | No                                           | Trending/traded/organic token list            |
| Jupiter Recent Tokens  | `GET /tokens/v2/recent`                        | No                                           | Jupiter's default recently pooled token list  |
| Jupiter Portfolio      | `GET /portfolio/v1/positions`                  | Wallet address or selected wallet public key | Position payload                              |
| Jupiter Swap Order     | `GET /swap/v2/order`                           | Taker address or selected wallet public key  | Quote and assembled order payload             |
| Jupiter Swap Build     | `GET /swap/v2/build`                           | Taker address or selected wallet public key  | Raw swap instruction payload                  |
| Jupiter Swap Execute   | `POST /swap/v2/execute`                        | Selected Cloud wallet                        | Execute status, signature, and result amounts |
| Jupiter Direct Swap    | `GET /swap/v2/order` + `POST /swap/v2/execute` | Selected Cloud wallet                        | Signature, route, and swap metadata           |

Use swap operations behind a guard step when the swap depends on external data:

```text
Webhook Trigger -> Fetch Price -> AI Agent -> If / Else -> Jupiter Direct Swap -> Workflow Result
```

`slippageBps` is basis points. `50` means `0.5%`. Leaving advanced order fields blank keeps more routers eligible. Receiver, referral, payer, and router-exclusion fields can change routing behavior.

For most first tests, choose `Jupiter Price`. It does not need a wallet and can run with keyless Jupiter access. For production rate limits, add a Jupiter credential or configure `JUPITER_API_KEY` on the server.

### Oracle Price

Oracle Price reads Pyth Hermes directly, searches Pyth feed IDs, or calls a Switchboard-compatible HTTP endpoint when you provide an API URL and credential.

| Operation          | Provider    | Required fields                   | Credential need                                                    |
| ------------------ | ----------- | --------------------------------- | ------------------------------------------------------------------ |
| Latest Price       | Pyth        | Feed ID                           | None for the public Hermes endpoint                                |
| Pyth Feed Search   | Pyth        | Search Query, optional Asset Type | None for the public Hermes endpoint                                |
| Pyth Latest Prices | Pyth        | Feed IDs                          | None for the public Hermes endpoint                                |
| Latest Price       | Switchboard | Feed ID plus API URL template     | `switchboard` or `webhook` headers when the endpoint requires auth |

Pyth output includes normalized price, raw price, confidence, exponent, publish time, and the fetch timestamp. Use `Pyth Latest Prices` when a workflow needs multiple feed IDs in one call.

### Helius RPC

Helius nodes are split by task. `Helius Wallet Activity` reads recent signatures through JSON-RPC, `Helius Transaction` reads raw JSON-RPC transaction details, `Helius Parse Transaction` uses Enhanced Transactions to turn one signature into readable transfer/swap/NFT data, and `Helius Address Transactions` fetches enhanced history for an address with type, source, token-account, sorting, and pagination filters.

Helius RPC is the low-level escape hatch for DAS and Solana JSON-RPC calls. It supports the standard DAS methods `getAsset`, `getAssetBatch`, `getAssetProof`, `getAssetProofBatch`, `getAssetsByAuthority`, `getAssetsByCreator`, `getAssetsByGroup`, `getAssetsByOwner`, `getNftEditions`, `getSignaturesForAsset`, `getTokenAccounts`, and `searchAssets`, plus Solana RPC methods such as `getSignaturesForAddress` and `getTransaction`.

Use Params JSON as the exact JSON-RPC params array. For DAS calls, add a Helius credential or a DAS-compatible RPC URL.

### Helius Webhooks

Helius webhook nodes turn realtime Solana activity into a Cloud trigger source.

| Node                  | Required fields                                          | Output                   |
| --------------------- | -------------------------------------------------------- | ------------------------ |
| Helius Webhook Create | Webhook URL, Webhook Type, Account Addresses, Credential | Created webhook metadata |
| Helius Webhook List   | Credential                                               | Existing webhook list    |
| Helius Webhook Delete | Webhook ID, Credential                                   | Delete response          |

Use `Webhook Trigger` first to create a Cloud webhook URL, then point `Helius Webhook Create` at that URL. For production, configure `authHeader` so Helius sends a secret your workflow can check.

### Metaplex Asset

Metaplex Asset is the guided DAS node for NFT, compressed NFT, and token metadata reads.

| Operation            | Required field                        | Notes                                                                  |
| -------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| Get Asset            | Asset ID                              | Single NFT/token metadata and ownership                                |
| Asset Proof          | Asset ID                              | Merkle proof for compressed assets                                     |
| Assets by Owner      | Owner Address                         | Supports pagination and display options                                |
| Assets by Collection | Group Key and Group Value             | Use `collection` as the group key for collections                      |
| Assets by Creator    | Creator Address                       | Optional verified-only filter                                          |
| Assets by Authority  | Authority Address                     | Finds assets controlled by an authority                                |
| Search Assets        | Search fields or Advanced Search JSON | Supports token type, owner, creator, group, sorting, and display flags |

This node requires a Helius credential unless you provide another DAS-compatible RPC URL.

### Squads Proposal

Squads Proposal sends a prepared approval payload to your own Squads-compatible API or webhook adapter. Squads v4 itself is SDK/program driven, so this node does not claim to directly create on-chain proposals without an adapter service. Use it to hand off treasury workflow output, transaction summaries, or token-account snapshots into an approval backend.

### Umbra Privacy

Umbra nodes are split into service checks and transfer planning:

| Node                 | API / SDK surface                         | Requires wallet?              | Output                                      |
| -------------------- | ----------------------------------------- | ----------------------------- | ------------------------------------------- |
| Umbra Indexer Health | `GET /health` on the UTXO indexer         | No                            | Indexer health payload                      |
| Umbra Relayer Info   | `GET /v1/relayer/info` on the relayer     | No                            | Relayer address, supported mints, pools     |
| Umbra Transfer Plan  | `@umbra-privacy/sdk` wallet/ZK handoff    | Yes for final private transfer | Transfer plan, warnings, endpoints, relayer |

The transfer node intentionally prepares a plan instead of pretending the server completed a private transfer. Umbra execution requires a wallet signer, `@umbra-privacy/web-zk-prover`, the UTXO indexer, and the relayer. Use the plan in the Output tab to verify recipient, mint, amount in base units, network, and endpoint selection before wiring final wallet execution.

Example starter:

```text
Manual Trigger -> Umbra Relayer Info -> Umbra Transfer Plan -> Workflow Result
```

### Solana RPC Providers

Solana RPC calls standard JSON-RPC methods through public RPC, RPCFast, Helius, QuickNode, Alchemy, Triton, or a custom HTTPS endpoint.

| Provider        | Required setup                     | Good for                                      |
| --------------- | ---------------------------------- | --------------------------------------------- |
| Public Mainnet  | None                               | Quick health checks and low-volume reads      |
| Public Devnet   | None                               | Safe testing                                  |
| Helius          | API key or RPC URL                 | Solana RPC plus DAS-compatible workflows      |
| RPCFast         | RPCFast HTTPS endpoint or credential | Production RPC, low latency, paid-plan methods |
| QuickNode       | Solana endpoint URL                | Standard Solana RPC and marketplace add-ons   |
| Alchemy         | API key or Solana RPC URL          | Hosted Solana mainnet RPC                     |
| Triton          | Solana endpoint URL                | Premium RPC, historical data, streaming stack |
| Custom RPC      | Any HTTPS Solana JSON-RPC endpoint | User-owned infra or another provider          |

Paste the full HTTPS endpoint into the node or save it as a provider credential. If the endpoint needs the key inserted, use `{apiKey}` in the URL and store the key in the credential.

Example:

```text
Manual Trigger -> Solana RPC -> Display Output
```

### Jito Bundles

Jito nodes are for priority transaction flow around already-signed transactions.

| Node               | Purpose                                                      |
| ------------------ | ------------------------------------------------------------ |
| Jito Tip Accounts  | Reads accounts eligible for bundle tips                      |
| Jito Tip Floor     | Reads recent landed tip percentiles                          |
| Jito Bundle Status | Checks landed or in-flight statuses for submitted bundle IDs |
| Jito Send Bundle   | Submits 1-5 already-signed transactions to the Block Engine  |

`Jito Send Bundle` does not sign transactions. Build and review the signed transaction bundle first, include a real Jito tip, then use `Jito Bundle Status` to confirm landing.

### Notifications

Notification nodes are split by destination so non-developers do not have to shape raw HTTP payloads.

| Node             | Credential | Notes                                               |
| ---------------- | ---------- | --------------------------------------------------- |
| Discord Message  | `discord`  | Incoming webhook URL; disables mentions by default  |
| Telegram Message | `telegram` | Bot token plus Chat ID                              |
| Dialect Alert    | `dialect`  | App ID, channels, wallet recipient, title, and body |

Use Display Output or Workflow Result before a notification node when you want the exact payload visible in the run output before it leaves Cloud.

### Custom API Request

Custom API Request is the user-defined node escape hatch. Use it when a workflow needs a provider that SolStudio does not have a dedicated node for yet.

It can call any HTTPS endpoint, merge a webhook credential into request headers, send a body from `{{ $json }}`, and store the response under a custom output field so later nodes can branch or display it.

## AI Agent

AI Agent calls an LLM to process workflow data.

| Property          | Meaning                                                                     |
| ----------------- | --------------------------------------------------------------------------- |
| Provider          | OpenAI, Anthropic, or Gemini                                                |
| Agent Mode        | Single Shot, JSON Decision, or Summarize                                    |
| Credential        | Optional provider credential. Environment variables can be used as fallback |
| Model             | Selected model                                                              |
| System Prompt     | Instruction that sets the agent behavior                                    |
| User Prompt       | Prompt content, often using expressions                                     |
| Tool Instructions | Describes available workflow context for the model to reason about          |
| Temperature       | Lower for deterministic decisions, higher for creative text                 |
| Max Tokens        | Response length limit                                                       |
| Request Timeout   | Maximum provider request time, capped for worker safety                     |
| Response Format   | Plain text or JSON object                                                   |
| Output Field      | JSON field where the AI result is stored                                    |
| Include Input     | Keeps incoming item data next to the AI result                              |
| Redact Sensitive Prompt Data | Masks obvious API keys, bearer tokens, private keys, and passwords before provider calls |

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
Wait is abort-aware and capped so it cannot hold a worker forever. Use Cron Trigger for long scheduling gaps instead of a very long Wait node.

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

Use display-only output nodes when you want the result inside SolStudio, and HTTP Request only when another system must receive the payload.

| Node            | Use                                                      | Output                                     |
| --------------- | -------------------------------------------------------- | ------------------------------------------ |
| Display Output  | Show a value in the Output tab without any external call | `display` object with title, format, value |
| Run Log         | Write an info, warning, or error line into the Logs tab  | `log` object and node logs                 |
| Workflow Result | Mark a final branch result for inspection after a run    | `result` object with name, status, value   |
| HTTP Request    | Send workflow results to another HTTP endpoint           | `httpResponse` with status, headers, body  |

HTTP Request sends data to another system. Keep first test workflows on Display Output, Run Log, or Workflow Result, then add HTTP Request only when an external service must receive the payload.

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

For a no-side-effect starter workflow, use:

```text
Manual Trigger -> Jupiter Price -> Workflow Result
```

## Wallets And Credentials

Cloud workflows can use encrypted wallets and credentials for automated actions.

| Resource             | Used by                                                   | Notes                                                              |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| Cloud wallet         | Token Transfer, Jupiter Swap Execute, Jupiter Direct Swap, Umbra Transfer Plan | Used for transaction signing or wallet execution handoff           |
| Birdeye credential   | Fetch Price                                               | Optional when `BIRDEYE_API_KEY` is available                       |
| Jupiter credential   | Jupiter Price, Token, Portfolio, and Swap nodes           | Optional for keyless reads; recommended for production rate limits |
| OpenAI credential    | AI Agent                                                  | Optional when `OPENAI_API_KEY` is available                        |
| Anthropic credential | AI Agent                                                  | Optional when `ANTHROPIC_API_KEY` is available                     |
| Gemini credential    | AI Agent                                                  | Optional when `GEMINI_API_KEY` or `GOOGLE_API_KEY` is available    |
| Webhook credential   | HTTP Request, Custom API Request                          | Merged into outbound request headers                               |
| RPCFast credential   | Solana RPC                                                | Stores the RPCFast HTTPS endpoint and optional API key              |
| Helius credential    | Helius RPC, Helius Webhooks, Solana RPC                   | Can store API key and optional RPC/API URL                         |
| QuickNode credential | Solana RPC                                                | Stores the QuickNode Solana endpoint and optional API key          |
| Alchemy credential   | Solana RPC                                                | Stores Alchemy API key or Solana endpoint                           |
| Triton credential    | Solana RPC                                                | Stores Triton Solana endpoint and optional API key                  |
| Jito credential      | Jito bundle nodes                                         | Stores `x-jito-auth` / UUID for authenticated block engine access   |
| Discord credential   | Discord Message                                           | Stores the incoming webhook URL                                     |
| Telegram credential  | Telegram Message                                          | Stores the bot token                                                |
| Dialect credential   | Dialect Alert                                             | Stores the Dialect API key and optional API URL                     |

Operational rules:

- Use a dedicated wallet per automation class.
- Keep wallet balances limited to what the workflow needs.
- Put AI or webhook approvals behind explicit branch nodes before wallet actions.
- Review execution logs after every activation.

## Common Workflow Patterns

| Pattern                | Graph                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| Scheduled market alert | `Cron Trigger -> Fetch Price -> If / Else -> Run Log`                                            |
| AI price monitor       | `Cron Trigger -> Fetch Price -> AI Agent -> If / Else -> Display Output`                         |
| Manual payout          | `Manual Trigger -> Token Transfer -> Filter -> Workflow Result`                                  |
| AI-assisted swap guard | `Webhook Trigger -> Fetch Price -> AI Agent -> If / Else -> Jupiter Direct Swap -> Workflow Result` |
| Private transfer plan  | `Manual Trigger -> Umbra Relayer Info -> Umbra Transfer Plan -> Workflow Result`                  |
| RPC health check       | `Manual Trigger -> Solana RPC -> Display Output`                                                  |
| Helius webhook source  | `Manual Trigger -> Helius Webhook Create -> Workflow Result`                                      |
| Jito readiness check   | `Manual Trigger -> Jito Tip Floor -> Jito Tip Accounts -> Display Output`                         |
| Custom provider call   | `Manual Trigger -> Custom API Request -> Display Output`                                          |
| External notification  | `Manual Trigger -> Discord Message or Telegram Message or Dialect Alert -> Workflow Result`       |

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
