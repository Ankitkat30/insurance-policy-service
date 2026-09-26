// Local-only demo; data is discarded on exit. Use Compose/Atlas for durable storage.
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { fork } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
const repl = await MongoMemoryReplSet.create({
  replSet: { count: 1 },
  binary: { downloadDir: join(tmpdir(), 'insurance-mongodb-binaries') },
});
const child = fork(new URL('../src/supervisor.js', import.meta.url), [], {
  env: {
    ...process.env,
    MONGODB_URI: repl.getUri(),
    DB_NAME: 'insurance_demo',
    API_KEY: process.env.API_KEY || 'local-review-key-change-me',
  },
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  if (child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  await repl.stop();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', () => {
  if (!stopping) stop();
});
child.on('message', (message) => {
  if (message.type === 'ready')
    console.log(
      `Demo ready: http://127.0.0.1:${message.port}. Import examples/sample.csv using Postman. Data is temporary.`,
    );
});
