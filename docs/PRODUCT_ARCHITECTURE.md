# SolStudio Product Architecture

SolStudio is one account system with three product surfaces:

- `solstudio.fun`: main brand, docs, marketplace, and visual program builder.
- `code.solstudio.fun`: focused visual builder/editor surface when deployed as a
  dedicated coding product.
- `cloud.solstudio.fun`: workflow automation for DeFi, wallets, webhooks,
  schedules, AI, and provider integrations.

## Boundary Rule

Auth, users, organizations, billing, audit logs, and marketplace identity should
be shared. Product data should stay separated:

- editor projects, generated code, compile records, deploy records.
- CLI local metadata, parser reports, source snapshots.
- cloud workflows, credentials, wallets, executions, node results.

This keeps one user identity across products without turning the database into a
single unbounded product blob.

## Routing Rule

Use subdomains for different jobs:

- Main site: discovery, docs, marketplace, account entry.
- Code/editor: repeated visual program-building work.
- Cloud: workflow automation and operational dashboards.

Cross-product navigation should be explicit and should preserve auth session,
but each product should have its own landing page and onboarding.

## Security Rule

Never share product-private data through generic user APIs. Every API response
must select only public fields for its product boundary. Secrets must remain
encrypted at rest and redacted in API responses, logs, and workflow snapshots.

## Launch Gate

Before launch, verify:

- shared auth works on all subdomains.
- cookies are configured for the parent domain.
- each product has separate onboarding and navigation.
- cloud health, queues, Redis, DB, webhooks, and worker restore are observable.
- editor/project APIs cannot read cloud credentials or wallets.
- cloud APIs cannot read editor deploy/program secret keys.
