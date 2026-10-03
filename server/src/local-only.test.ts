import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DEMO = '1';
process.env.BUDGET_DB = ':memory:';
const { localOnly } = await import('./main.ts');

const run = (hostname: string, origin?: string) => {
  let status = 200;
  let nexted = false;
  const res: any = { status: (s: number) => ((status = s), res), json: () => res };
  localOnly({ hostname, headers: { origin } } as any, res, () => (nexted = true));
  return nexted ? 200 : status;
};

test('localOnly allows loopback host and origin', () => {
  assert.equal(run('127.0.0.1'), 200);
  assert.equal(run('localhost', 'http://localhost:4200'), 200);
});

test('localOnly rejects foreign host or origin', () => {
  assert.equal(run('evil.example'), 403);
  assert.equal(run('127.0.0.1', 'http://evil.example'), 403);
  assert.equal(run('127.0.0.1', 'null'), 403);
});
