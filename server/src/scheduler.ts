import { backupToday } from './backup.ts';
import { lastSync, syncOnce } from './sync.ts';
import { getConfig } from './db.ts';
import { runtimeEnv } from './runtime.ts';
import { secret } from './wallet.ts';

const HOUR = 36e5;

async function tick() {
  try {
    if (backupToday()) console.log('backup written');
  } catch (e) {
    console.error(`backup failed: ${(e as Error).message}`);
  }
  if (!secret('WALLET_API_TOKEN') || getConfig().currency !== 'EUR') return;
  const last = lastSync();
  if (last && Date.now() - Date.parse(last) < HOUR) return;
  try {
    await syncOnce();
  } catch (e) {
    console.error(`auto-fetch failed: ${(e as Error).message}`);
  }
}

/** Backup (daily) and Wallet fetch (when last sync is over an hour old), checked at startup then hourly. Not for demo. */
export function startScheduler(): void {
  if (runtimeEnv().DEMO === '1') return;
  void tick();
  setInterval(() => void tick(), HOUR).unref();
}
