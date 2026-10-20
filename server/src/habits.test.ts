import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.BUDGET_DB = ':memory:';
const { db, getConfig, setConfig } = await import('./db.ts');
const { app } = await import('./main.ts');

test('habit log and push subscription routes', async () => {
  setConfig({ ...getConfig(), habits: [{ id: 'stretch', name: 'Stretch', time: '07:30' }] });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const call = (method: string, path: string, body?: unknown) =>
    fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  try {
    assert.equal((await call('PUT', '/habits/2026-07-10/stretch')).status, 204);
    assert.equal((await call('PUT', '/habits/2026-07-10/stretch')).status, 204);
    assert.equal((await call('PUT', '/habits/2026-07-10/nope')).status, 400);
    assert.equal((await call('PUT', '/habits/10-07-2026/stretch')).status, 400);
    assert.deepEqual(await (await call('GET', '/habits?from=2026-07-01&to=2026-07-31')).json(), [{ day: '2026-07-10', habit: 'stretch' }]);
    assert.equal((await call('DELETE', '/habits/2026-07-10/stretch')).status, 204);
    assert.deepEqual(await (await call('GET', '/habits?from=2026-07-01&to=2026-07-31')).json(), []);

    assert.deepEqual(await (await call('GET', '/push/key')).json(), { key: null });
    const keys = { p256dh: 'p', auth: 'a' };
    assert.equal((await call('POST', '/push/subscribe', { endpoint: 'http://x.test/1', keys })).status, 400);
    assert.equal((await call('POST', '/push/subscribe', { endpoint: 'https://x.test/1', keys: {} })).status, 400);
    assert.equal((await call('POST', '/push/subscribe', { endpoint: 'https://x.test/1', keys })).status, 204);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n, 1);
    assert.equal((await call('DELETE', '/push/subscribe', { endpoint: 'https://x.test/1' })).status, 204);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n, 0);
  } finally {
    server.close();
  }
});
