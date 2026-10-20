import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('./', import.meta.url);
const src = await readFile(new URL('public/sw.js', root), 'utf8');

function fetchHandler() {
  const listeners = {};
  const self = { location: { origin: 'https://x.test' }, addEventListener: (type, fn) => { listeners[type] = fn; } };
  const cache = { match: async () => undefined, put: async () => {}, keys: async () => [], delete: async () => {} };
  const caches = { open: async () => cache };
  const fetch = async () => { throw new Error('offline'); };
  const Response = { error: () => ({ type: 'error' }) };
  new Function('self', 'caches', 'fetch', 'Response', src)(self, caches, fetch, Response);
  return listeners.fetch;
}

function responds(url, { method = 'GET', mode = 'cors' } = {}) {
  let promise;
  fetchHandler()({ request: { url, method, mode }, respondWith(p) { promise = p; } });
  promise?.catch(() => {});
  return promise !== undefined;
}

test('fetch handler passes through api, access, non-GET and cross-origin requests', () => {
  assert.equal(responds('https://x.test/api/x'), false);
  assert.equal(responds('https://x.test/cdn-cgi/access/authorized', { mode: 'navigate' }), false);
  assert.equal(responds('https://x.test/month', { method: 'POST', mode: 'navigate' }), false);
  assert.equal(responds('https://other.test/main-ABCD1234.js'), false);
});

test('fetch handler answers same-origin navigations and hashed assets', () => {
  assert.equal(responds('https://x.test/month', { mode: 'navigate' }), true);
  assert.equal(responds('https://x.test/main-ABCD1234.js'), true);
});

test('service worker keeps push and notificationclick handlers', () => {
  const types = [];
  const self = { location: { origin: 'https://x.test' }, addEventListener: (type) => types.push(type) };
  new Function('self', 'caches', 'fetch', 'Response', src)(self, {}, () => {}, {});
  assert.deepEqual(types, ['push', 'notificationclick', 'install', 'activate', 'fetch']);
});
