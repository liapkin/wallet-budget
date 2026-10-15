export async function readAccessCookie() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') throw new Error('Access cookie prompt requires an interactive terminal');
  process.stderr.write('Cloudflare Access application cookie: ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  let value = '';
  let onData;
  try {
    await new Promise((resolve, reject) => {
      onData = (text) => {
        for (const char of text) {
          if (char === '\u0003') return reject(new Error('cancelled'));
          if (char === '\r' || char === '\n') return resolve();
          if (char === '\u007f') value = value.slice(0, -1);
          else value += char;
        }
      };
      process.stdin.on('data', onData);
    });
  } finally {
    if (onData) process.stdin.off('data', onData);
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stderr.write('\n');
  }
  if (!value) throw new Error('Access cookie is required');
  return value;
}

export const accessHeaders = (cookie, origin, json = false) => ({
  cookie: `CF_Authorization=${cookie}`,
  ...(origin ? { origin } : {}),
  ...(json ? { 'content-type': 'application/json' } : {}),
});
