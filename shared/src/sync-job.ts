export type SyncJob = {
  status: 'idle' | 'running' | 'succeeded' | 'failed';
  inserted: number;
  updated: number;
  deleted: number;
  error?: string;
  nextRetryAt?: string;
  warnings?: string[];
};
