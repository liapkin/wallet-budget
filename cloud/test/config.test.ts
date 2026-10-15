import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readWrangler } from './wrangler-config.ts';

test('preview script and config never target production', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const cfg = readWrangler();
  assert.match(pkg.scripts.preview, /--env preview/);
  assert.notEqual(cfg.env.preview.name, cfg.name);
  assert.equal(cfg.env.preview.vars.PREVIEW_SEED, '1');
  assert.equal('PREVIEW_SEED' in cfg.vars, false);
});
