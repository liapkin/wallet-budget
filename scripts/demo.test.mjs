import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { findFreePort, proxyConfig } from './demo.mjs';

let occupied;
after(() => occupied?.close());

test('demo skips an occupied default port and points proxy at chosen API port', async () => {
  occupied = createServer();
  await new Promise((resolve) => occupied.listen(0, '127.0.0.1', resolve));
  const port = occupied.address().port;
  assert.notEqual(await findFreePort(port), port);
  assert.deepEqual(proxyConfig(3002), {
    '/api': { target: 'http://127.0.0.1:3002', secure: false },
  });
});

test('web port search can start after a high API fallback', async () => {
  const apiPort = 4201;
  assert.ok(await findFreePort(Math.max(4201, apiPort + 1)) > apiPort);
});
