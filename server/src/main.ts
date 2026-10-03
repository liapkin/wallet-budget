import express, { type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { db, getConfig, setConfig, currencyLocked } from './db.ts';
import { activeSource, runPipeline, spendSummary } from './pipeline.ts';
import { insertApiRecord, lastSync, syncOnce } from './sync.ts';
import { del, post } from './wallet.ts';
import { startScheduler } from './scheduler.ts';
import { walletPayload } from './wallet-payload.ts';
import { dietConfigError } from './diet-config.ts';
import { athensLocalToUtc } from '../../shared/src/month.ts';
import type { Config } from '../../shared/src/types.ts';

const demo = process.env.DEMO === '1';
const app = express();
app.use(express.json({ limit: '5mb' }));

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
  const cents = Math.round(value * 100);
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
    db.prepare('DELETE FROM records WHERE id=?').run(r.id);
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
  for (const [k, v] of Object.entries(body))
    if (v === null) db.prepare('DELETE FROM core_actuals WHERE month=? AND key=?').run(month, k);
    else db.prepare('INSERT OR REPLACE INTO core_actuals (month, key, cents) VALUES (?, ?, ?)').run(month, k, v as number);
  res.status(204).end();
});

app.get('/api/wallet-categories', (req, res) => {
  res.json(db.prepare('SELECT id, name, parent FROM categories ORDER BY parent, name').all());
});

app.get('/api/accounts', (req, res) => {
  res.json(db.prepare('SELECT id, name, balance_cents AS balanceCents, currency, updated_at AS updatedAt FROM accounts ORDER BY name').all());
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
