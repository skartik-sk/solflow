# Cloud

SolStudio Cloud is the automation platform. Instead of generating a Rust program, you build workflows that run on triggers and execute Solana-aware actions.

Want a guided workflow path? Open the [Cloud Learning Path](/docs/learn/cloud) and practice Cloud nodes, AI, and workflow order.

---

## Mental Model

A Cloud workflow is a directed graph:

| Node family | Examples                                            | Purpose                                            |
| ----------- | --------------------------------------------------- | -------------------------------------------------- |
| Trigger     | Manual, Cron, Webhook                               | Start a workflow run                               |
| Action      | Token Transfer, Jupiter Swap, Price Fetch, AI Agent | Do work against APIs, wallets, or Solana protocols |
| Logic       | If/Else, Wait                                       | Control the path and timing                        |
| Transform   | Filter                                              | Shape data before the next step                    |
| Output      | Webhook                                             | Send results to another system                     |

## First Workflow

1. Open the Cloud dashboard.
2. Create a new workflow.
3. Add a **Manual Trigger** node.
4. Add a **Price Fetch** node.
5. Connect `Manual Trigger -> Price Fetch`.
6. Add an **If/Else** node to compare the fetched price.
7. Add a **Webhook Output** node for alerts.
8. Run the workflow manually and inspect the execution log.

## Wallets And Credentials

Cloud workflows can use encrypted wallets and credentials for automated actions.

- Add wallets before using token transfer or swap actions.
- Use the smallest wallet balance needed for the workflow.
- Keep workflow actions explicit so each transaction is easy to audit.
- Check execution logs after every activation.

## Common Workflow Patterns

| Pattern                | Graph                                                    |
| ---------------------- | -------------------------------------------------------- |
| Scheduled market check | `Cron Trigger -> Price Fetch -> If/Else -> Webhook`      |
| Token payout           | `Manual Trigger -> Token Transfer -> Webhook`            |
| AI-assisted decision   | `Webhook Trigger -> AI Agent -> If/Else -> Jupiter Swap` |
| Delayed follow-up      | `Manual Trigger -> Wait -> Webhook`                      |

## Cloud Versus Visual Builder

| Question                                             | Use Visual Builder | Use Cloud |
| ---------------------------------------------------- | ------------------ | --------- |
| Am I creating an on-chain Solana program?            | Yes                | No        |
| Do I need generated Rust code?                       | Yes                | No        |
| Do I need a workflow to keep running?                | No                 | Yes       |
| Do I need cron, webhooks, wallets, and integrations? | No                 | Yes       |

## Activation Checklist

- The workflow has exactly one trigger path you understand.
- Every wallet action uses the intended wallet.
- Every conditional branch has a visible next step.
- Webhook URLs and credentials are configured.
- You ran a manual test before activating scheduled or webhook triggers.
- Execution logs show the expected inputs and outputs.
