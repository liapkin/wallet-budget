# Private Cloudflare hosting

The hosted app is a single-user, online-only Android PWA. Cloudflare Workers serves Angular and `/api` on the same HTTPS `workers.dev` address. One SQLite-backed Durable Object holds the database. No domain purchase or paid plan is required.

Local mode and demo remain supported. Hosted and local databases do not synchronize. After cutover, the hosted database is authoritative; do not run local automatic sync or make local edits expecting them to appear online.

## Release requirements

- A Cloudflare account on the Workers Free plan with Zero Trust enabled.
- Cloudflare Access covering all traffic to the Worker, including previews; allow only the owner's email, use email one-time codes, and set session duration to 24 hours. Do not use a bypass policy.
- Signed Access identity verification configured in the Worker. An email header alone is not authentication. Missing configuration must deny access.
- Separate preview and production Durable Object namespaces. Preview receives only generic fixtures and no production Wallet credentials.
- Private credentials configured as Worker secrets. Never upload `.env`, personal seed files, local specs, SQLite files or exports as static assets.
- Backend tests, frontend tests and lint passing. Agent sessions must not run frontend builds or dev servers. Production Angular builds run in Cloudflare's build pipeline.

Cloudflare Access setup: <https://developers.cloudflare.com/workers/configuration/cloudflare-access/>.

## Migration order

1. Validate the preview deployment with generic fixtures, including unauthenticated and unauthorized requests, expired sessions, mobile layout and installability.
2. Stop the local app and any scheduled sync. Keep the current database untouched and make a consistent private migration snapshot.
3. Deploy production in maintenance mode. Configure owner identity and Access before uploading any personal data. Confirm that requests without identity and with another identity cannot reach either assets or API routes.
4. Enable migration temporarily. Upload the validated snapshot with `pnpm cloud:migrate <url> [data/budget.db|snapshot.json]` (details in `cloud/OPERATIONS.md`; `pnpm cloud:snapshot <url> <file>` and `pnpm cloud:recover <url> bookmark|restore <timestamp>` for backups); interrupted uploads must be resumable without duplicating rows. Preserve record IDs, config, manual entries, group overrides, duplicate decisions and historical snapshots.
5. Verify the imported table counts and budget totals against the snapshot. Verify export and restore with a separate test object. Disable migration, enable hosted sync, and check a complete successful sync.
6. Install from Android Chrome's menu and confirm the home-screen icon launches the standalone app. Record the deployed version and the time the hosted database became authoritative.

Migration and backup files contain personal financial data. Keep them in git-ignored `data/`, use restrictive file permissions, and never paste their contents into logs or issue reports.

## Free-tier limits

Free tier has hard limits, including SQL row reads/writes, storage, Worker execution and Durable Object duration. A limit being reached may interrupt service until reset; do not resolve this by silently upgrading billing.

The backend must avoid rewriting unchanged classification results and must checkpoint sync across bounded alarm invocations. Check Cloudflare metrics during a representative browsing session and a complete sync before cutover. Include scheduled activity, retries and manual refreshes in the daily estimate, with room for normal growth.

Pricing and limits: <https://developers.cloudflare.com/durable-objects/platform/pricing/> and <https://developers.cloudflare.com/durable-objects/platform/limits/>.

## Backups and recovery

Cloudflare SQLite-backed Durable Objects provide 30-day point-in-time recovery. Hosted backups do not use the local filesystem. Local mode continues its daily SQLite backups and keeps the newest 14.

Download a portable private export before releases and significant data changes, and keep a separate weekly copy outside Cloudflare. Test restore into an isolated object before relying on it. A code rollback does not roll back database contents.

For a failed initial migration, disable hosted writes and return to the untouched local database. Once cloud edits exist, first export the cloud database; returning to the original local snapshot would lose those edits. Keep hosted sync disabled while restoring or returning to local operation. Never run both as live writable copies.

Recovery API: <https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#pitr-point-in-time-recovery-api>.

## Android behavior

Open the protected app in Chrome, sign in, then choose **Add to Home screen / Install app**. Data and edits require internet. Financial responses are not service-worker cached, and failed writes are not automatically replayed. Session expiry requires signing in again; connection failures require reconnecting before editing.

Real-device acceptance includes installation, standalone launch, navigation and deep-link refresh, record preview/confirmation, login expiry, network loss and a subsequent deployment update.
