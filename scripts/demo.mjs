import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');

export async function findFreePort(start) {
  for (let port = start; port <= 65535; port++) {
    const free = await new Promise((resolvePort, reject) => {
      const server = createServer();
      server.once('error', (error) => error.code === 'EADDRINUSE' ? resolvePort(false) : reject(error));
      server.listen(port, '127.0.0.1', () => server.close(() => resolvePort(true)));
    });
    if (free) return port;
  }
  throw new Error(`No free localhost ports from ${start}`);
}

export const proxyConfig = (apiPort) => ({
  '/api': { target: `http://127.0.0.1:${apiPort}`, secure: false },
});

const start = (command, args, options) => {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  const exited = new Promise((resolveExit) => {
    child.once('error', (error) => resolveExit({ code: 1, error }));
    child.once('exit', (code, signal) => resolveExit({ code: code ?? 1, signal }));
  });
  return { child, exited };
};

async function seed() {
  const { exited } = start(process.execPath, ['src/demo.ts'], { cwd: join(root, 'server') });
  const result = await exited;
  if (result.error) throw result.error;
  if (result.code !== 0) throw new Error(`Demo seed exited with code ${result.code}`);
}

export async function runDemo() {
  await seed();
  const apiPort = await findFreePort(3001);
  const webPort = await findFreePort(Math.max(4201, apiPort + 1));
  const temp = mkdtempSync(join(tmpdir(), 'budget-demo-'));
  const proxy = join(temp, 'proxy.json');
  writeFileSync(proxy, JSON.stringify(proxyConfig(apiPort)));

  const env = { ...process.env, DEMO: '1', BUDGET_DB: 'data/demo.db', PORT: String(apiPort) };
  const server = start(process.execPath, ['--watch', 'src/main.ts'], { cwd: join(root, 'server'), env });
  const web = start(join(root, 'web', 'node_modules', '.bin', 'ng'), [
    'serve', '--host', '127.0.0.1', '--port', String(webPort), '--proxy-config', proxy,
  ], { cwd: join(root, 'web'), env: process.env });
  console.log(`Demo: http://127.0.0.1:${webPort} (API ${apiPort})`);

  let signalCode = 0;
  const stop = (signal) => {
    for (const child of [server.child, web.child]) if (child.exitCode === null) child.kill(signal);
  };
  const onInt = () => { signalCode = 130; stop('SIGTERM'); };
  const onTerm = () => { signalCode = 143; stop('SIGTERM'); };
  process.once('SIGINT', onInt);
  process.once('SIGTERM', onTerm);

  // ponytail: probe/bind race; retry port allocation on EADDRINUSE if concurrent demos matter.
  const result = await Promise.race([server.exited, web.exited]);
  stop('SIGTERM');
  await Promise.all([server.exited, web.exited]);
  process.off('SIGINT', onInt);
  process.off('SIGTERM', onTerm);
  rmSync(temp, { recursive: true, force: true });
  if (result.error) throw result.error;
  return signalCode || result.code;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runDemo().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
