import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
// The helper otherwise caches recently used ports and silently chooses another on restart.
// Replica-set metadata on disk requires the same port for the same data directory.
class FixedPortReplicaSet extends MongoMemoryReplSet {
  getInstanceOpts(...args) {
    return { ...super.getInstanceOpts(...args), portGeneration: false };
  }
}
// Development convenience only. A real mongod writes durable WiredTiger files here.
export async function startLocalDatabase({ dataDir = 'work/mongodb', port = 27017 } = {}) {
  const dbPath = resolve(dataDir);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('LOCAL_MONGO_PORT must be 1-65535');
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () =>
      reject(
        new Error(
          `MongoDB port ${port} is in use. Stop the other instance or configure LOCAL_MONGO_PORT.`,
        ),
      ),
    );
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
  await mkdir(dbPath, { recursive: true, mode: 0o700 });
  const repl = await FixedPortReplicaSet.create({
    instanceOpts: [{ port, dbPath }],
    replSet: { count: 1, name: 'rs0', storageEngine: 'wiredTiger' },
    binary: { downloadDir: join(tmpdir(), 'insurance-mongodb-binaries') },
  });
  const uri = `mongodb://127.0.0.1:${port}/?replicaSet=rs0&directConnection=true`;
  if (repl.servers[0].instanceInfo.port !== port) {
    await repl.stop({ doCleanup: false });
    throw new Error('Requested MongoDB port became unavailable');
  }
  return { uri, dbPath, stop: () => repl.stop({ doCleanup: false }) };
}
