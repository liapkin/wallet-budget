# Spec

All amounts are EUR, stored as integer cents. Starting values come from `config/seed-config.json` if present, else `config/seed-config.example.json`. Acceptance values for a specific dataset live in docs/SPEC.local.md and *.local.test.ts.

## 1. Goal

One screen that answers: where does this month stand against the plan, per category, without typing.

Non-goals: multi-user, cloud hosting, bank connections of its own, investment execution, mobile app.

## 2. Data source: Wallet (BudgetBakers)

### API

- Base URL `https://rest.budgetbakers.com/wallet`. OpenAPI: `https://rest.budgetbakers.com/wallet/openapi/ui`. Read the OpenAPI document for exact paths and record fields before writing the client.
- Auth: `Authorization: Bearer <token>`. Premium plan required. Token is generated in the Wallet web app settings.
- Pagination: `limit` (default 30, max 200), `offset`; the response carries `nextOffset`.
- Filters use prefixes: `eq.`, `contains.`, `contains-i.`, `gt.`, `gte.`, `lt.`, `lte.`. Date-only values are whole-day UTC.
- Rate limit: 300 requests an hour, token bucket. On `429` honour `Retry-After`. Headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`.
- Write calls exist (create, update, delete). They are off by default; see CLAUDE.md.

### Export file (fallback and test fixture)

Wallet exports `.xls` with a `Records` sheet and these columns, in order:

`account, category, currency, amount, ref_currency_amount, type, payment_type, payment_type_local, note, date, gps_latitude, gps_longitude, gps_accuracy_in_meters, warranty_in_month, transfer, payee, labels, envelope_id, custom_category`

- `amount` is negative for expenses. `type` is `Expenses` or `Income`.
- `payment_type` is `CASH`, `MOBILE_PAYMENT` or `TRANSFER`.
- Ignore the `Debts` sheet.

### Data quality caveats

- A payment can be stored twice: once as `MOBILE_PAYMENT` when paid, once as `TRANSFER` when the bank feed posts it, up to a week later. The two copies may carry different Wallet categories.
- Bank-feed timestamps are often midnight-ish on the posting date, not the purchase time.
- Wallet categories are unreliable. The same merchant can appear under several categories. Classify by merchant first.
- Months before the bank feed was connected may hold only hand-entered records and are lower bounds.
- Duplicates the rule below does not catch (amounts differing by cents) are not handled automatically.

## 3. Domain rules

### Duplicates

A record is a duplicate when its `payment_type` is `MOBILE_PAYMENT` and a `TRANSFER` record with the same amount exists dated from 1 day before to 7 days after it. Keep the `TRANSFER` record. Each `TRANSFER` absorbs at most one `MOBILE_PAYMENT`. Duplicates are flagged, never deleted, and excluded from every total.

### Groups

Precedence, first match wins:

1. A manual group override on the record.
2. A merchant keyword of an excluded (non-spending) group, any record type.
3. `type = Income` gives `Income`.
4. A case-insensitive substring match of any merchant keyword in `note`.
5. The Wallet category map.
6. `Other`.

Keywords, the category map, the group list and the excluded groups are config. Unclassified merchants must be easy to assign in the UI; assigning one adds a keyword.

### Months

A record belongs to the month of its date in Europe/Athens. Counts ("orders", "visits") are the number of non-duplicate records in the group.

## 4. Budget model

Fixed euro amounts, not percentages.

- Net income per year = salary × 12 + bonuses. Bonuses are fractions of a salary in configured months; they can go entirely to investing.
- Monthly allocation: core expenses (sum of the lines marked in plan), fun, sinking-fund top-up, and investing = salary − core − fun − sinking. The four sum to the salary.
- Annual investing = monthly investing × 12 + bonuses (when they go to investing).
- Emergency fund = core × months of cover. Savings total = sum of the chosen savings accounts' balances plus cash savings, or the manual bank-savings fallback when none is chosen. Sinking fund = savings − emergency fund, floored at zero.
- Core actuals per month: each core line has an actual. Lines whose source is `wallet:Group+Group` are read from the groups, plus any typed amount; the rest are typed. Non-standing lines show only in months where a value is typed.
- Month status: fun = sum of the fun groups; unplanned = spend in groups that are not fed to a core line, fun, covered by core, excluded, or income; investing so far = salary − core actuals − fun − unplanned − sinking top-up.
- Caps: takeout and kiosk have monthly caps from the `applyFrom` date. Both sit inside fun. An optional buffer month (nullable) has no target.
- Optional config: investment accounts (their balances sum to "invested so far") and a payroll account, both chosen from the synced accounts.

### Investing projection

Fifteen years, yearly steps. Contribution in year n = annual investing × (1 + salary growth)^(n−1) − trading cost. Everything goes to one global equity ETF at gross return minus TER; contributions earn half a year of return in the year they are made. A `houseFundFirst` switch, off by default, routes contributions to a low-return house fund until the house cash (deposit plus purchase costs) is covered. Show nominal and inflation-adjusted totals, and the first year the total covers the house cash. State on screen that the return is an assumption.

## 5. Diet and groceries

- Protein target = body weight × grams per kg.
- A meal is a list of ingredients with grams, protein and kcal per 100 g. A week assigns breakfast, lunch, snack, dinner and shake per day. Show protein and kcal per day against the targets.
- Grocery list: weekly items and a monthly pantry. Cost = quantity × (offer price if present, else regular price). Monthly cost = weekly × 52/12 + pantry, compared with the groceries core line.
- Weekly ingredient quantities are derived from the week's meals.

## 6. Screens

1. **Month** (home): groups against plan and caps, takeout per day, days left, investing remainder so far, savings, invested and payroll balances.
2. **History**: one row per month, same columns, duplicates excluded.
3. **Records**: filter by month, group, account; show the duplicate flag; reassign a group.
4. **Budget**: core lines, allocation, caps, accounts, groups, keywords, category map; edit in place.
5. **Core actuals**: month by line, typed cells and Wallet-fed cells visibly different.
6. **Meal plan** and **Grocery list**.
7. **Investing**: the projection.

## 7. Phases and acceptance checks

Acceptance values for a specific dataset live in docs/SPEC.local.md and *.local.test.ts. Tracked tests use `config/seed-config.example.json` or inline fixtures.

1. **Import, dedupe, classify, History screen.** Import a Wallet export; duplicate count and monthly group totals match the dataset's expected values. If Athens-local bucketing moves a record across a month boundary, report the difference; do not tune the rule to match.
2. **Wallet API sync.** Same pipeline from the API, incremental by date, idempotent. Totals equal Phase 1 for the same period.
3. **Budget, caps, core actuals, Month screen.** With the seed values the allocation sums to the salary.
4. **Meal plan and grocery list.** Day totals, week average, protein target and grocery cost follow the formulas in section 5.
5. **Investing projection.** Contribution, balance and first-year-covering-house-cash follow section 4.

Later, optional: weekly supermarket offers suggesting offer prices; export to xlsx.
