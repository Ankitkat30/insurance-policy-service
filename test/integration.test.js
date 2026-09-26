import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import writeXlsxFile from 'write-excel-file/node';
import { connect, indexes } from '../src/config/database.js';
import { config as loadConfig } from '../src/config/env.js';
import { ImportPool } from '../src/workers/import.pool.js';
import { createApp } from '../src/app.js';
import { deliverDue } from '../src/services/scheduler.js';
let repl, client, db, app, pool, directory, config;
const sample = new URL('../examples/sample.csv', import.meta.url);
before(
  async () => {
    directory = await mkdtemp(join(tmpdir(), 'insurance-test-'));
    repl = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      binary: {
        downloadDir:
          process.env.MONGOMS_DOWNLOAD_DIR || join(tmpdir(), 'insurance-mongodb-binaries'),
      },
    });
    config = loadConfig({
      MONGODB_URI: repl.getUri(),
      DB_NAME: 'integration',
      UPLOAD_DIR: join(directory, 'uploads'),
    });
    ({ client, db } = await connect(config));
    await indexes(db);
    pool = new ImportPool(config);
    app = await createApp({ db, pool, config });
  },
  { timeout: 180000 },
);
after(async () => {
  await pool?.close();
  await client?.close();
  await repl?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('CSV import runs worker, populates six collections and is idempotent', async () => {
  for (let i = 0; i < 2; i++) {
    const response = await request(app)
      .post('/api/imports')
      .attach('file', sample.pathname)
      .expect(200);
    assert.deepEqual(response.body, { processed: 3, succeeded: 3, rejected: 0, errors: [] });
  }
  for (const [name, count] of Object.entries({
    agents: 1,
    users: 2,
    accounts: 2,
    lobs: 2,
    carriers: 1,
    policies: 3,
  }))
    assert.equal(await db.collection(name).countDocuments(), count, name);
  assert.equal((await db.collection('users').findOne({ firstname: 'Alex Example' })).zip, '00123');
  assert.equal((await readdir(config.UPLOAD_DIR)).length, 0);
});
test('search is case insensitive, paginated, joined, and safe from query injection', async () => {
  const response = await request(app)
    .get('/api/policies/search')
    .query({ username: 'ALEX EXAMPLE', limit: 1 })
    .expect(200);
  assert.equal(response.body.total, 2);
  assert.equal(response.body.data.length, 1);
  assert.equal(response.body.data[0].carrier.companyName, 'Demo Insurance');
  assert.equal(
    (await request(app).get('/api/policies/search').query({ username: 'alex@example.com' })).body
      .total,
    3,
  );
  assert.equal(
    (await request(app).get('/api/policies/search').query({ username: '.*' })).body.total,
    0,
  );
  await request(app).get('/api/policies/search?username[$ne]=x').expect(400);
  await request(app).get('/api/policies/search?username=x&limit=101').expect(400);
});
test('aggregation returns policy counts per distinct user', async () => {
  const response = await request(app).get('/api/policies/aggregate').expect(200);
  assert.equal(response.body.total, 2);
  assert.deepEqual(response.body.data.map((x) => x.policyCount).sort(), [1, 2]);
});
test('XLSX import supports real date cells without duplicates', async () => {
  const csv = (await readFile(sample, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => line.split(','));
  const dateColumns = ['dob', 'policy_start_date', 'policy_end_date'];
  const rows = csv.map((row, index) =>
    row.map((value, col) =>
      index && dateColumns.includes(csv[0][col])
        ? { type: Date, value: new Date(`${value}T00:00:00Z`), format: 'yyyy-mm-dd' }
        : { type: String, value },
    ),
  );
  const path = join(directory, 'sample.xlsx');
  await writeXlsxFile(rows).toFile(path);
  const response = await request(app).post('/api/imports').attach('file', path).expect(200);
  assert.equal(response.body.succeeded, 3);
  assert.equal(await db.collection('policies').countDocuments(), 3);
});
test('invalid rows are reported without partial row writes; bad uploads are rejected', async () => {
  const csv = await readFile(sample, 'utf8');
  const broken = csv.split('\n').slice(0, 2).join('\n').replace('1990-02-15', '1990-02-30');
  const response = await request(app)
    .post('/api/imports')
    .attach('file', Buffer.from(broken), 'bad.csv')
    .expect(200);
  assert.equal(response.body.rejected, 1);
  assert.equal(response.body.errors[0].row, 2);
  assert.equal(await db.collection('policies').countDocuments(), 3);
  await request(app)
    .post('/api/imports')
    .attach('file', Buffer.from('x,y\n1,2'), 'bad.csv')
    .expect(422);
  await request(app)
    .post('/api/imports')
    .attach('file', Buffer.from('hello'), 'bad.xlsx')
    .expect(422);
  await request(app)
    .post('/api/imports')
    .attach('file', Buffer.from('hello'), 'bad.txt')
    .expect(400);
  await request(app).post('/api/imports').expect(400);
  assert.equal((await readdir(config.UPLOAD_DIR)).length, 0);
});
test('overload rejects imports instead of spawning unlimited workers', async () => {
  const busy = await createApp({ db, config, pool: { available: false } });
  await request(busy).post('/api/imports').expect(503);
});
test('message stays pending until due and concurrent schedulers deliver exactly once', async () => {
  const future = new Date(Date.now() + 60000);
  const response = await request(app)
    .post('/api/messages/schedule')
    .send({
      message: 'scheduled hello',
      day: future.toISOString().slice(0, 10),
      time: future.toISOString().slice(11, 19),
      timezone: 'UTC',
    })
    .expect(201);
  const id = response.body._id;
  assert.equal(await deliverDue(db, client), 0);
  assert.equal(await db.collection('messages').countDocuments(), 0);
  const due = new Date(future.getTime() + 1000);
  await Promise.all([deliverDue(db, client, due), deliverDue(db, client, due)]);
  assert.equal(await db.collection('messages').countDocuments(), 1);
  assert.equal(
    (await request(app).get(`/api/messages/schedules/${id}`).expect(200)).body.status,
    'delivered',
  );
  assert.equal((await request(app).get(`/api/messages?jobId=${id}`).expect(200)).body.total, 1);
  await deliverDue(db, client, due);
  assert.equal(await db.collection('messages').countDocuments(), 1);
});
test('validation and optional API authentication protect endpoints', async () => {
  await request(app)
    .post('/api/messages/schedule')
    .send({ message: 'x', day: 'y', time: 'z' })
    .expect(400);
  await request(app).get('/api/messages/schedules/nope').expect(400);
  await request(app).get('/api/messages/schedules/000000000000000000000000').expect(404);
  const protectedApp = await createApp({
    db,
    pool,
    config: { ...config, API_KEY: 'test-secret-at-least-16' },
  });
  await request(protectedApp).get('/api/messages').expect(401);
  await request(protectedApp)
    .get('/api/messages')
    .set('x-api-key', 'test-secret-at-least-16')
    .expect(200);
  await request(protectedApp).get('/health').expect(200);
});
test(
  'real supervisor restarts server after CPU threshold and pending job survives',
  { timeout: 30000 },
  async () => {
    const future = new Date(Date.now() + 4000);
    const { insertedId } = await db
      .collection('scheduledJobs')
      .insertOne({ message: 'survives restart', status: 'pending', scheduledAt: future });
    const child = fork(new URL('../src/supervisor.js', import.meta.url), [], {
      env: {
        ...process.env,
        ...Object.fromEntries(Object.entries(config).map(([k, v]) => [k, String(v)])),
        PORT: '0',
        CPU_THRESHOLD: '0.000001',
        CPU_INTERVAL_MS: '500',
        SCHEDULER_INTERVAL_MS: '100',
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let output = '';
    child.stdout.on('data', (value) => {
      output += value;
    });
    child.stderr.on('data', (value) => {
      output += value;
    });
    try {
      let ready = 0;
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Restart timed out: ${output}`)), 20000);
        child.on('message', (message) => {
          if (message.type === 'ready' && ++ready >= 3) {
            clearTimeout(timeout);
            resolve();
          }
        });
        child.on('error', reject);
      });
      assert.match(output, /cpu_restart/);
      assert.match(output, /restart_scheduled/);
      let message;
      for (let i = 0; i < 30; i++) {
        message = await db.collection('messages').findOne({ jobId: insertedId });
        if (message) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(message?.message, 'survives restart');
    } finally {
      const exit = once(child, 'exit');
      child.kill('SIGTERM');
      await exit;
    }
  },
);
test(
  'provided assessment sample imports all rows',
  { skip: !process.env.ASSESSMENT_SAMPLE, timeout: 120000 },
  async () => {
    const response = await request(app)
      .post('/api/imports')
      .attach('file', process.env.ASSESSMENT_SAMPLE)
      .expect(200);
    assert.equal(response.body.processed, 1198);
    assert.equal(response.body.succeeded, 1198);
    assert.equal(response.body.rejected, 0);
  },
);

test('occupied HTTP port exits cleanly with a useful error', { timeout: 10000 }, async () => {
  const occupied = createServer();
  occupied.listen(0, '127.0.0.1');
  await once(occupied, 'listening');
  const child = fork(new URL('../src/server.js', import.meta.url), [], {
    env: {
      ...process.env,
      MONGODB_URI: config.MONGODB_URI,
      DB_NAME: config.DB_NAME,
      PORT: String(occupied.address().port),
      UPLOAD_DIR: config.UPLOAD_DIR,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = '';
  child.stdout.on('data', (value) => {
    output += value;
  });
  child.stderr.on('data', (value) => {
    output += value;
  });
  try {
    const [code] = await once(child, 'exit');
    assert.equal(code, 1);
    assert.match(output, /EADDRINUSE/);
    assert.doesNotMatch(output, /TypeError/);
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM');
    occupied.close();
  }
});
