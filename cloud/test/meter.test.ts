import test from 'node:test';
import assert from 'node:assert/strict';
import { routeKey, UsageMeter } from '../src/meter.ts';

test('routeKey normalizes ids and months', () => {
  assert.equal(routeKey('GET', '/api/month-close/2026-03'), 'GET /api/month-close/:month');
  assert.equal(routeKey('DELETE', '/api/records/123'), 'DELETE /api/records/:id');
  assert.equal(routeKey('GET', '/api/config'), 'GET /api/config');
});

test('UsageMeter aggregates, sorts by rowsRead', () => {
  const u = new UsageMeter();
  u.add('a', { rowsRead: 5, rowsWritten: 1 });
  u.add('a', { rowsRead: 5, rowsWritten: 0 });
  u.add('b', { rowsRead: 20, rowsWritten: 0 });
  const r = u.report();
  assert.deepEqual(r.totals, { rowsRead: 30, rowsWritten: 1, calls: 3 });
  assert.deepEqual(r.routes.map((x) => x.route), ['b', 'a']);
});
