// Shared by both entrypoints (apps/api/src/main.ts — HTTP API — and main-worker.ts — the
// standalone BullMQ event worker, see WorkerModule) so they always agree on how to reach Redis.
export function parseRedisConnection() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  };
}
