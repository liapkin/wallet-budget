# Budget tracker

Single-user web app that pulls transactions from the Wallet (BudgetBakers) API or an export file, removes duplicates, classifies them and shows each month against a fixed-amount budget. It also holds a meal plan, a grocery list and an investing projection. Stack: Node.js, TypeScript, Express, SQLite, Angular. See `docs/SPEC.md`.

## Setup

```
pnpm install
cp config/seed-config.example.json config/seed-config.json
```

Create `.env` with `WALLET_API_TOKEN=<your token>`. Edit `config/seed-config.json`; it seeds the database on first run.

## Commands

- `pnpm dev` runs the server and the web app together.
- `pnpm sync` pulls Wallet records, then dedupes and classifies.
- `pnpm run import <file.xls>` runs the same pipeline from a Wallet export.
- `pnpm test`, `pnpm lint`

## Data

The server listens on localhost only. The database, exports, `.env` and personal config stay on your machine and are git-ignored.

## Credits

Built with Claude Code (Anthropic).
