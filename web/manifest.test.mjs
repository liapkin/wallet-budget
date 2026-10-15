import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('./', import.meta.url);

test('manifest supports online standalone install', async () => {
  const manifest = JSON.parse(await readFile(new URL('public/manifest.webmanifest', root), 'utf8'));
  assert.deepEqual(
    { id: manifest.id, name: manifest.name, start_url: manifest.start_url, scope: manifest.scope, display: manifest.display },
    { id: '/', name: 'Budget tracker', start_url: '/month', scope: '/', display: 'standalone' },
  );
  assert.deepEqual(manifest.icons.map(({ sizes, purpose }) => ({ sizes, purpose })), [
    { sizes: '192x192', purpose: 'any maskable' },
    { sizes: '512x512', purpose: 'any maskable' },
  ]);
  const index = await readFile(new URL('src/index.html', root), 'utf8');
  assert.match(index, /rel="manifest" href="manifest\.webmanifest" crossorigin="use-credentials"/);
  for (const icon of manifest.icons) {
    const png = await readFile(new URL(`public/${icon.src}`, root));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});
