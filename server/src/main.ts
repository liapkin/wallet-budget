import express, { type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { db, getConfig, setConfig, currencyLocked, tx } from './db.ts';
import { activeSource, runPipeline, spendSummary, toRec } from './pipeline.ts';
import { insertApiRecord, lastSync, syncOnce } from './sync.ts';
import { del, post } from './wallet.ts';
import { startScheduler } from './scheduler.ts';
import { walletPayload } from './wallet-payload.ts';
import { dietConfigError } from './diet-config.ts';
import { athensDay, athensLocalToUtc, athensMonth } from '../../shared/src/month.ts';
import { capsFor, monthStatus } from '../../shared/src/budget.ts';
import { budgetAlerts, monthClose, pairKey, possibleDuplicates, recurring, suggestGroup, yearReview } from '../../shared/src/insights.ts';
import { toCents } from '../../shared/src/money.ts';
import type { Config } from '../../shared/src/types.ts';

const demo = process.env.DEMO === '1';
const app = express();

const LOCAL = new Set(['127.0.0.1', 'localhost']);
// Blocks DNS rebinding (Host) and cross-site browser requests (Origin) against the unauthenticated API.
export function localOnly(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  let originHost: string | undefined;
  try {
    originHost = origin === undefined ? undefined : new URL(origin).hostname;
  } catch {
    originHost = '';
  }
  if (!LOCAL.has(req.hostname) || (originHost !== undefined && !LOCAL.has(originHost))) return void res.status(403).json({ error: 'forbidden' });
  next();
}
app.use(localOnly);
app.use(express.json({ limit: '256kb' }));

class BadRequest extends Error {}
const bad = (msg: string): never => {
  throw new BadRequest(msg);
};
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const SELECT = `SELECT id, source, account, category, amount_cents AS amountCents, type, payment_type AS paymentType,
  note, date_utc AS dateUtc, created_in_app AS createdInApp, group_override AS groupOverride, is_dup AS isDup, dup_of AS dupOf, grp, month FROM records`;
const present = (r: any) => ({ ...r, isDup: !!r.isDup, createdInApp: !!r.createdInApp });
const getRecord = (id: unknown) => {
  const r = db.prepare(`${SELECT} WHERE id=?`).get(Number(id));
  return r ? present(r) : undefined;
};

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/config', (req, res) => {
  res.json(getConfig());
});

export function updateConfig(req: Request, res: Response) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) bad('config must be an object');
  for (const k of Object.keys(getConfig())) if (k !== 'currency' && !(k in body)) bad(`missing config key: ${k}`);
  const dietError = dietConfigError(body.diet);
  if (dietError) bad(dietError);
  try {
    setConfig(body as Config);
  } catch (e) {
    bad((e as Error).message);
  }
  runPipeline();
  res.json(getConfig());
}

app.put('/api/config', updateConfig);

const scope = () => ({ sql: "source IN (?, 'manual')", args: [activeSource()] });

export const getMeta = () => {
  const s = scope();
  const col = (c: string, order = '') =>
    (db.prepare(`SELECT DISTINCT ${c} AS v FROM records WHERE ${s.sql} ${order}`).all(...s.args) as { v: string }[]).map((r) => r.v);
  const cfg = getConfig();
  const { groups, excludedGroups } = cfg.wallet;
  return { demo, currency: cfg.currency, currencyLocked: demo || currencyLocked(), groups, excludedGroups, accounts: col('account', 'ORDER BY 1'), months: col('month', 'ORDER BY 1 DESC'), lastSync: lastSync() };
};

app.get('/api/meta', (req, res) => {
  res.json(getMeta());
});

app.get('/api/summary', (req, res) => {
  const s = scope();
  const income: Record<string, number> = {};
  const rows = db
    .prepare(`SELECT month, SUM(amount_cents) AS c FROM records WHERE is_dup=0 AND type='Income' AND ${s.sql} GROUP BY month`)
    .all(...s.args) as { month: string; c: number }[];
  for (const r of rows) income[r.month] = r.c;
  res.json({ spend: spendSummary(), income });
});

app.get('/api/records', (req, res) => {
  const s = scope();
  const where = [s.sql];
  const args: string[] = [...s.args];
  for (const [q, col] of [['month', 'month'], ['group', 'grp'], ['account', 'account']] as const) {
    const v = req.query[q];
    if (v === undefined || v === '') continue;
    if (typeof v !== 'string') bad(`invalid ${q}`);
    where.push(`${col}=?`);
    args.push(v as string);
  }
  const rows = db.prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY date_utc DESC, id DESC`).all(...args);
  res.json(rows.map(present));
});

app.post('/api/records', async (req, res, next) => {
  try {
    await createRecord(req, res);
  } catch (e) {
    next(e);
  }
});

export async function createRecord(req: Request, res: Response) {
  const { date, amount, note, category, type = 'Expenses', account, toWallet, accountId, categoryId } = req.body ?? {};
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(str(date));
  if (!m) bad('date must be YYYY-MM-DDTHH:mm');
  if (type !== 'Expenses' && type !== 'Income') bad('type must be Expenses or Income');
  const value = typeof amount === 'string' && amount.trim() !== '' ? Number(amount.replace(',', '.')) : amount;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) bad('amount must be a number > 0');
  const [y, mo, d, h, mi] = m!.slice(1).map(Number);
  const cents = toCents(value);
  if (toWallet === true) {
    if (demo) bad('Disabled in demo mode');
    if (getConfig().currency !== 'EUR') bad('Wallet sync, import and writes support EUR databases only');
    const acc = db.prepare('SELECT currency FROM accounts WHERE id=?').get(str(accountId)) as { currency: string } | undefined;
    if (!acc) bad('unknown Wallet account');
    if (acc!.currency !== 'EUR') bad('only EUR accounts are supported');
    if (str(categoryId) && !db.prepare('SELECT 1 FROM categories WHERE id=?').get(str(categoryId))) bad('unknown Wallet category');
    const payload = walletPayload({ accountId: str(accountId), categoryId: str(categoryId) || undefined, type, cents, date: str(date), note: str(note) });
    let result: any;
    try {
      result = (await post('/v1/api/records', [payload])).results?.[0];
    } catch (e) {
      return void res.status(502).json({ error: `Wallet rejected the record: ${(e as Error).message}` });
    }
    if (!result?.success || !result.record) {
      return void res.status(502).json({ error: `Wallet rejected the record: ${String(result?.error ?? 'no result').slice(0, 120)}` });
    }
    // ext_id is the Wallet id, so the next sync upserts it unchanged.
    insertApiRecord(result.record);
    db.prepare('UPDATE records SET created_in_app=1 WHERE ext_id=?').run(result.record.id);
    runPipeline();
    return void res.status(201).json(present(db.prepare(`${SELECT} WHERE ext_id=?`).get(result.record.id)));
  }
  const info = db
    .prepare(
      `INSERT INTO records (source, ext_id, account, category, amount_cents, type, payment_type, note, date_utc)
       VALUES ('manual', ?, ?, ?, ?, ?, 'CASH', ?, ?)`,
    )
    .run(
      'manual:' + randomUUID(),
      str(account) || 'Manual',
      str(category),
      type === 'Expenses' ? -cents : cents,
      type,
      str(note),
      athensLocalToUtc(y, mo, d, h, mi, 0),
    );
  runPipeline();
  res.status(201).json(getRecord(info.lastInsertRowid));
}

app.delete('/api/records/:id', async (req, res, next) => {
  try {
    const r = getRecord(req.params.id);
    if (!r) return void res.status(404).json({ error: 'not found' });
    if (req.query.wallet === '1') {
      if (demo) bad('Disabled in demo mode');
      if (r.source !== 'api' || !r.createdInApp) return void res.status(403).json({ error: 'only records created by this app can be deleted in Wallet' });
      const extId = (db.prepare('SELECT ext_id FROM records WHERE id=?').get(r.id) as { ext_id: string }).ext_id;
      let result: any;
      try {
        result = (await del('/v1/api/records', [extId])).results?.[0];
      } catch (e) {
        return void res.status(502).json({ error: `Wallet rejected the delete: ${(e as Error).message}` });
      }
      if (!result?.success) return void res.status(502).json({ error: `Wallet rejected the delete: ${String(result?.error ?? 'no result').slice(0, 120)}` });
    } else if (r.source !== 'manual') return void res.status(403).json({ error: 'only manual records can be deleted' });
    tx(() => {
      db.prepare('DELETE FROM dup_decisions WHERE a=? OR b=?').run(r.id, r.id);
      db.prepare('DELETE FROM records WHERE id=?').run(r.id);
    });
    runPipeline();
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

app.patch('/api/records/:id', (req, res) => {
  const g = req.body?.groupOverride;
  if (g !== null && !getConfig().wallet.groups.includes(g)) bad('groupOverride must be a known group or null');
  if (!getRecord(req.params.id)) return void res.status(404).json({ error: 'not found' });
  db.prepare('UPDATE records SET group_override=? WHERE id=?').run(g, Number(req.params.id));
  runPipeline();
  res.json(getRecord(req.params.id));
});

app.post('/api/keywords', (req, res) => {
  const keyword = str(req.body?.keyword);
  const group = req.body?.group;
  const cfg = getConfig();
  if (!keyword) bad('keyword required');
  if (!cfg.wallet.groups.includes(group)) bad('unknown group');
  const list = cfg.wallet.merchantKeywords;
  if (!list.some((k) => k.keyword.toLowerCase() === keyword.toLowerCase())) {
    list.push({ keyword, group });
    setConfig(cfg);
    runPipeline();
  }
  res.status(201).json(list);
});

app.get('/api/actuals', (req, res) => {
  const m = req.query.month;
  const rows = (m === undefined
    ? db.prepare('SELECT month, key, cents FROM core_actuals')
    : db.prepare('SELECT month, key, cents FROM core_actuals WHERE month=?')).all(...(m === undefined ? [] : [str(m)])) as { month: string; key: string; cents: number }[];
  if (m !== undefined) return void res.json(Object.fromEntries(rows.map((r) => [r.key, r.cents])));
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) (out[r.month] ??= {})[r.key] = r.cents;
  res.json(out);
});

app.put('/api/actuals/:month', (req, res) => {
  const month = req.params.month;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) bad('month must be YYYY-MM');
  const keys = getConfig().coreExpenses.map((l) => l.key);
  const body = req.body ?? {};
  for (const [k, v] of Object.entries(body)) {
    if (!keys.includes(k)) bad(`unknown line: ${k}`);
    if (v !== null && !Number.isInteger(v)) bad(`${k} must be integer cents or null`);
  }
  const delOne = db.prepare('DELETE FROM core_actuals WHERE month=? AND key=?');
  const setOne = db.prepare('INSERT OR REPLACE INTO core_actuals (month, key, cents) VALUES (?, ?, ?)');
  tx(() => {
    for (const [k, v] of Object.entries(body)) v === null ? delOne.run(month, k) : setOne.run(month, k, v as number);
  });
  res.status(204).end();
});

app.get('/api/wallet-categories', (req, res) => {
  res.json(db.prepare('SELECT id, name, parent FROM categories ORDER BY parent, name').all());
});

app.get('/api/accounts', (req, res) => {
  res.json(db.prepare('SELECT id, name, balance_cents AS balanceCents, currency, updated_at AS updatedAt FROM accounts ORDER BY name').all());
});

// ---- insights

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthParam = (v: unknown): string => (typeof v === 'string' && MONTH.test(v) ? v : bad('month must be YYYY-MM'));
const monthsAgo = (n: number): string => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString();
};
// non-dup expenses (active source + manual) since `since`
const liveRows = (since: string, extra = '') =>
  (db.prepare(`${SELECT} WHERE is_dup=0 AND type='Expenses' AND source IN (?, 'manual') AND date_utc>=? ${extra}`).all(activeSource(), since) as any[]).map(present);

app.get('/api/recurring', (req, res) => {
  const rows = liveRows(monthsAgo(13));
  const grp = new Map(rows.map((r) => [r.id, r.grp]));
  const items = recurring(rows.map(toRec), (r) => grp.get(r.id));
  res.json({ items, monthlyTotalCents: items.reduce((s, i) => s + i.typicalCents, 0) });
});

app.get('/api/possible-duplicates', (req, res) => {
  const rows = liveRows(monthsAgo(13));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const decided = new Set((db.prepare('SELECT a, b FROM dup_decisions').all() as { a: number; b: number }[]).map((d) => pairKey(d.a, d.b)));
  res.json(possibleDuplicates(rows.map(toRec), decided).map((p) => ({ a: byId.get(p.a.id), b: byId.get(p.b.id) })));
});

app.post('/api/possible-duplicates', (req, res) => {
  const { a, b, decision } = req.body ?? {};
  if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) bad('a and b must be two different record ids');
  if (decision !== 'dup' && decision !== 'not') bad("decision must be 'dup' or 'not'");
  if (!getRecord(a) || !getRecord(b)) return void res.status(404).json({ error: 'not found' });
  db.prepare('INSERT OR REPLACE INTO dup_decisions (a, b, decision) VALUES (?, ?, ?)').run(Math.min(a, b), Math.max(a, b), decision);
  runPipeline();
  res.status(204).end();
});

app.get('/api/unclassified', (req, res) => {
  const since = monthsAgo(24);
  const rows = liveRows(since);
  const classified = rows.filter((r) => r.grp !== 'Other').map((r) => ({ note: r.note, group: r.grp }));
  res.json(rows.filter((r) => r.grp === 'Other').map((r) => ({ ...r, suggestion: suggestGroup(toRec(r), classified) })));
});

app.post('/api/records/bulk-group', (req, res) => {
  const { ids, group } = req.body ?? {};
  if (!Array.isArray(ids) || !ids.length || !ids.every(Number.isInteger)) bad('ids must be a non-empty array of record ids');
  if (!getConfig().wallet.groups.includes(group)) bad('unknown group');
  const upd = db.prepare('UPDATE records SET group_override=? WHERE id=?');
  tx(() => {
    for (const id of ids) upd.run(group, id);
  });
  runPipeline();
  res.status(204).end();
});

app.get('/api/balances/history', (req, res) => {
  res.json(db.prepare('SELECT day, account, balance_cents AS balanceCents FROM balance_snapshots ORDER BY day, account').all());
});

const monthGroupSpend = (month: string): Record<string, number> =>
  Object.fromEntries(Object.entries(spendSummary()[month] ?? {}).map(([g, c]) => [g, c.cents]));
const monthTyped = (month: string): Record<string, number> =>
  Object.fromEntries((db.prepare('SELECT key, cents FROM core_actuals WHERE month=?').all(month) as { key: string; cents: number }[]).map((r) => [r.key, r.cents]));

app.get('/api/alerts', (req, res) => {
  const month = monthParam(req.query.month);
  const cfg = getConfig();
  const spend = monthGroupSpend(month);
  const status = monthStatus(cfg, spend, monthTyped(month));
  const now = new Date();
  let daysLeft = 0;
  if (month === athensMonth(now.toISOString())) {
    const [y, m] = month.split('-').map(Number);
    daysLeft = new Date(y, m, 0).getDate() - Number(athensDay().slice(8)) + 1;
  }
  const caps = capsFor(month, cfg);
  res.json(
    budgetAlerts(
      [
        { key: 'fun', label: 'Fun', spentCents: status.fun, capCents: cfg.allocation.funPerMonth },
        ...(caps ? (['Takeout', 'Kiosk'] as const).map((g) => ({ key: g, label: g, spentCents: spend[g] ?? 0, capCents: caps[g] })) : []),
      ],
      daysLeft,
    ),
  );
});

app.get('/api/month-close/:month', (req, res) => {
  const month = monthParam(req.params.month);
  const balances = Object.fromEntries((db.prepare('SELECT name, balance_cents AS c FROM accounts').all() as { name: string; c: number }[]).map((a) => [a.name, a.c]));
  const status = monthStatus(getConfig(), monthGroupSpend(month), monthTyped(month));
  const row = db.prepare('SELECT json FROM month_close WHERE month=?').get(month) as { json: string } | undefined;
  res.json({ transfers: monthClose(getConfig(), balances, status), done: row ? JSON.parse(row.json) : [] });
});

app.put('/api/month-close/:month', (req, res) => {
  const month = monthParam(req.params.month);
  const done = req.body?.done;
  if (!Array.isArray(done) || !done.every((d) => typeof d === 'string')) bad('done must be an array of strings');
  db.prepare('INSERT OR REPLACE INTO month_close (month, json) VALUES (?, ?)').run(month, JSON.stringify(done));
  res.status(204).end();
});

app.get('/api/year/:y', (req, res) => {
  if (!/^\d{4}$/.test(req.params.y)) bad('year must be YYYY');
  const year = Number(req.params.y);
  const w = getConfig().wallet;
  const review = yearReview(spendSummary(), year, ['Income', ...w.excludedGroups]);
  if (req.query.format !== 'csv') return void res.json(review);
  const eur = (c: number) => (c / 100).toFixed(2);
  const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
  const lines = ['group,amount,prev,delta', ...review.groups.map((g) => [cell(g.group), eur(g.cents), eur(g.prevCents), eur(g.deltaCents)].join(','))];
  res.type('text/csv').attachment(`year-${year}.csv`).send(lines.join('\n') + '\n');
});

app.post('/api/sync', (req, res, next) => {
  if (demo) bad('Disabled in demo mode');
  if (getConfig().currency !== 'EUR') bad('Wallet sync, import and writes support EUR databases only');
  syncOnce().then((r) => res.json(r), next);
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof BadRequest || (err as any).type === 'entity.parse.failed') return void res.status(400).json({ error: err.message });
  console.error(err.message);
  res.status(500).json({ error: 'internal error' });
});

const port = Number(process.env.PORT ?? 3000);
if (import.meta.main) {
  app.listen(port, '127.0.0.1', () => {
    console.log(`listening on http://127.0.0.1:${port}`);
  });
  startScheduler();
}
