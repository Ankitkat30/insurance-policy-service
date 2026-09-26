import { fork } from 'node:child_process';
import { once } from 'node:events';
import { startLocalDatabase } from './lib/local-database.js';
const database = await startLocalDatabase({
  dataDir: process.env.LOCAL_DATA_DIR || 'work/mongodb',
  port: Number(process.env.LOCAL_MONGO_PORT || 27017),
});
const dbName = process.env.DB_NAME || 'insurance_assessment';
console.log(
  `MongoDB connection: ${database.uri}\nDatabase: ${dbName}\nPersistent data directory: ${database.dbPath}`,
);
const child = fork(new URL('../src/supervisor.js', import.meta.url), [], {
  env: {
    ...process.env,
    MONGODB_URI: database.uri,
    DB_NAME: dbName,
    API_KEY: process.env.API_KEY || 'local-review-key-change-me',
  },
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  await database.stop();
  console.log('Stopped. MongoDB data is preserved for the next npm run local.');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', () => {
  if (!stopping) void stop();
});
child.on('message', (message) => {
  if (message.type === 'ready') {
    console.log(
      `API ready: http://127.0.0.1:${message.port}. Open postman/README.md for requests.`,
    );
    process.send?.({ ...message, mongodbUri: database.uri, dbName, dbPath: database.dbPath });
  }
});
