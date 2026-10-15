# Cloud operations

This deployment uses one SQLite-backed Durable Object named `owner`, Worker static assets, and the free `workers.dev` address. Do not deploy or upload a database until Access is configured and tested.

## Build and Access

Cloudflare Workers Builds settings (Worker, repository root, branch `main`, build variable `NODE_VERSION=24`, preview builds off):

- Build command: `pnpm install --frozen-lockfile && pnpm --filter web exec ng build`
- Deploy command, preview Worker: `pnpm --filter cloud exec wrangler deploy --env preview`
- Deploy command, production Worker: `pnpm --filter cloud deploy`

The asset directory is `web/dist/web/browser`; assets are built by Cloudflare, never locally.

Create one Cloudflare Access self-hosted application for both the production and preview `workers.dev` hostnames. Add only the owner's email with One-time PIN, set the application and policy session duration to 24 hours, and deny everyone else. Set Worker variables `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, and `OWNER_EMAIL`. Store `WALLET_API_TOKEN` and `COINMARKETCAP_API_KEY` with `wrangler secret put`; never put their values in Wrangler config. The Worker validates the Access JWT signature, issuer, audience, expiry, token type, and owner email itself, so missing settings fail closed.

Verify both production and preview URLs before uploading data: unauthenticated requests must not reach assets or `/api/health`; the owner must receive a one-time code and then load both; another email must be denied. Preview uses its own Worker name and Durable Object namespace. Turn preview off when no longer needed.

Preview alone sets `PREVIEW_SEED=1`, which seeds generic example data and marks only its isolated namespace ready. Production never sets this variable and remains in maintenance until a validated import finishes.

## Migration and snapshots

Production starts empty and stays in maintenance until a migration has finalized. Set `MIGRATION_ENABLED=1` only for the migration window. This enables only versioned, allowlisted migration/export endpoints. Copy the short-lived `CF_Authorization` application cookie from an authenticated browser; the script reads it through a silent prompt and does not save it in shell history. Then run:

```sh
pnpm cloud:migrate https://<worker>.<subdomain>.workers.dev data/budget.db
```

The last argument may also be a JSON file written by `cloud:snapshot` (portable restore into an empty store).

The destination must be empty. Chunks are idempotent, IDs are preserved, and finalize checks every table count. After success, restore `MIGRATION_ENABLED=0`, deploy the variable change, and compare app totals before changing local mode. The local SQLite app remains available.

For a private backup file on an encrypted/offline volume, temporarily enable maintenance and run:

```sh
pnpm cloud:snapshot https://<worker>.<subdomain>.workers.dev /private/path/budget.json
```

The script writes mode `0600` through a temporary file and never logs record data or tokens. Disable maintenance immediately afterward.

## Recovery

SQLite Durable Objects retain point-in-time recovery history for 30 days. Set `RECOVERY_ENABLED=1` to force maintenance and enable only owner-authenticated recovery/export endpoints. Record the current bookmark with `pnpm cloud:recover <url> bookmark`; schedule recovery with `pnpm cloud:recover <url> restore <ISO-timestamp>`. The script requires a second `RESTORE` confirmation. Trigger a new object session, verify counts through the protected export, then set `RECOVERY_ENABLED=0`. PITR is unavailable in local development. Keep an independent private snapshot for failures outside the retention window.
