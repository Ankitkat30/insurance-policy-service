import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { MongoClient } from 'mongodb';
import { startLocalDatabase } from '../scripts/lib/local-database.js';
test(
  'local database preserves records across shutdown and restart',
  { timeout: 60000 },
  async () => {
    const path = await mkdtemp(join(tmpdir(), 'insurance-persistence-'));
    const probe = createServer().listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const port = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    let database, client;
    try {
      database = await startLocalDatabase({ dataDir: path, port });
      client = await new MongoClient(database.uri).connect();
      await client
        .db('persistence_test')
        .collection('proof')
        .insertOne({ _id: 'survives', value: 42 });
      await client.close();
      await database.stop();
      database = await startLocalDatabase({ dataDir: path, port });
      client = await new MongoClient(database.uri).connect();
      assert.equal(
        (await client.db('persistence_test').collection('proof').findOne({ _id: 'survives' }))
          .value,
        42,
      );
    } finally {
      await client?.close();
      await database?.stop();
      await rm(path, { recursive: true, force: true });
    }
  },
);
