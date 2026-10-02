# Agent instructions

- Read and follow `CLAUDE.md`; also follow `CLAUDE.local.md` when present. Read `docs/SPEC.md` before domain work. Never copy personal data into tracked instructions.
- Use Ponytail and Caveman at full level for main and delegated agents. If unavailable, disclose that and follow their principles manually.
- Astra is planning-only. Delegate implementation, testing, and review to non-Astra agents.
- Route work by smallest suitable model: `gpt-5.6-luna` low for lookups, docs, and mechanical edits; `gpt-5.6-terra` medium for ordinary fixes and bounded features; `gpt-5.6-sol` high for difficult debugging, cross-cutting changes, money, or security. Escalate on complexity or failed verification.
- Keep tasks bounded with relevant context, explicit file ownership, and acceptance checks. Parallelize only independent work; avoid overlapping edits. If a model or delegation is missing, report the limitation; never silently implement with Astra.
- Use pnpm and relevant checks. Do not start the frontend dev server or run frontend builds. Preserve user changes. Follow domain tests and privacy rules in `CLAUDE.md`.
- This is policy guidance, not global configuration or automatic active-model switching.
