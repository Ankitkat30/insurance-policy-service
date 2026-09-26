import { config as loadConfig } from './config/env.js';
import { connect, indexes } from './config/database.js';
import { createApp } from './app.js';
import { ImportPool } from './workers/import.pool.js';
import { startScheduler } from './services/scheduler.js';
import { startCpuMonitor } from './services/cpu.js';
const config = loadConfig();
let client,
  server,
  stopScheduler,
  stopCpu,
  closing = false;
const pool = new ImportPool(config);
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  stopCpu?.();
  const deadline = setTimeout(() => process.exit(code), 10000);
  deadline.unref();
  const drained = server ? new Promise((resolve) => server.close(resolve)) : Promise.resolve();
  await pool.close();
  await stopScheduler?.();
  await drained;
  await client?.close();
  process.exit(code);
}
process.on('SIGTERM', () => shutdown());
process.on('SIGINT', () => shutdown());
try {
  const connection = await connect(config);
  client = connection.client;
  const db = connection.db;
  const hello = await db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('MongoDB replica set required');
  await indexes(db);
  const metrics = {};
  const app = await createApp({ db, pool, config, metrics });
  server = app.listen(config.PORT, config.HOST, (error) => {
    if (error) {
      console.error(JSON.stringify({ event: 'listen_failed', code: error.code }));
      void shutdown(1);
      return;
    }
    console.log(
      JSON.stringify({ event: 'listening', host: config.HOST, port: server.address().port }),
    );
    process.send?.({ type: 'ready', port: server.address().port });
    stopCpu = startCpuMonitor({
      threshold: config.CPU_THRESHOLD,
      interval: config.CPU_INTERVAL_MS,
      onSample: (value) => {
        metrics.cpuPercent = Math.round(value * 100) / 100;
      },
      onThreshold: (value) => {
        console.log(JSON.stringify({ event: 'cpu_restart', cpuPercent: value }));
        shutdown(75);
      },
    });
  });
  server.requestTimeout = 150000;
  server.on('error', () => shutdown(1));
  stopScheduler = startScheduler(db, client, config.SCHEDULER_INTERVAL_MS);
} catch (error) {
  console.error(
    JSON.stringify({
      event: 'startup_failed',
      message: error.message.replace(/mongodb[^ ]*/g, '[redacted]'),
    }),
  );
  await shutdown(1);
}
