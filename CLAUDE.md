# Budget tracker

Single-user web app that replaces a budget spreadsheet. It pulls transactions from the Wallet (BudgetBakers) API, removes duplicates, classifies them, and shows each month against a fixed-amount budget. It also holds a high-protein meal plan and the grocery list that the food budget pays for.

Read `docs/SPEC.md` before any domain work. It holds the rules and the acceptance checks. `config/seed-config.example.json` holds generic starting data.

Personal data (config/seed-config.json, docs/SPEC.local.md, CLAUDE.local.md, *.local.test.ts, data/, .env) is git-ignored; read the local files when present.

## Stack

- Node.js LTS, TypeScript, Express. REST API under `/api`.
- Angular, current stable release (not AngularJS 1.x). Standalone components, signals, strict mode.
- SQLite in `data/budget.db`. One user, one machine; no server database.
- pnpm workspaces: `server/`, `web/`, `shared/` (types and pure domain functions used by both).
- Tests: the runner each side ships with by default. Domain logic lives in `shared/` and is tested there.

## Layout

```
server/   Express API, Wallet client, SQLite access
web/      Angular app
shared/   Types, dedupe, classification, budget maths (pure functions, no I/O)
config/   seed-config.example.json (tracked), seed-config.json (personal, ignored)
data/     budget.db, Wallet exports (git-ignored)
docs/     SPEC.md (SPEC.local.md ignored)
```

## Commands

Use pnpm only. Never npm or npx; use `pnpm dlx` for one-off tools.

- `pnpm dev` — server and web together, web proxied to the API
- `pnpm sync` — pull Wallet records into SQLite, then dedupe and classify
- `pnpm run import <file.xls>` — same pipeline from a Wallet export file (`run` is required: bare `pnpm import` is a pnpm built-in)
- `pnpm test` — all workspaces
- `pnpm lint`

## Rules

- **Secrets and data stay local.** The Wallet token is read from `.env` (`WALLET_API_TOKEN`). Never print it, never commit it. `data/`, `.env` and any `*.xls*` are git-ignored from the first commit.
- **Bind to localhost only.** No auth layer is planned, so the server must not listen on other interfaces.
- **Read-only against Wallet by default.** No create, update or delete call to the Wallet API unless the user asks for it in that session, and then behind an explicit `--write` flag with a dry run first.
- **Payee data is sensitive.** The Wallet `payee` field holds names and IBANs. Store it if needed for matching, never log it, never show it in the UI.
- **Money is integer cents.** No floats in storage or arithmetic. Format at the edge.
- **Time zone is Europe/Athens.** Month boundaries are local, not UTC.
- **Config over code.** Budget lines, caps, merchant keywords and the category map are data, editable in the UI, seeded from `config/seed-config.json`, else the example. Do not hardcode them.
- **Raw records are immutable.** Duplicate flags and groups are derived columns; re-running classification must be safe and repeatable.
- **No new dependency without a reason** stated in the commit message.

## Working style

- Build in the phases listed in the spec. Each phase ends with its acceptance checks passing.
- Write the test for a domain rule before the rule. Tracked tests use only the example seed or inline fixtures; dataset-specific checks go in `*.local.test.ts`.
- Commit small, message in the imperative, no filler.
- Documentation is minimal and factual. No marketing tone, no emojis.
- When the spec is silent or contradicts the data, stop and ask.
