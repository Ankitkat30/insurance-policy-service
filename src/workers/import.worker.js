import { saveImportRow } from '../repositories/import.repository.js';
import { parentPort, workerData } from 'node:worker_threads';
import { connect } from '../config/database.js';
import { readRows } from '../services/file-reader.service.js';
import { normalize } from '../validators/import.schema.js';
let client;
try {
  const connection = await connect(workerData.config);
  client = connection.client;
  const db = connection.db;
  const summary = { processed: 0, succeeded: 0, rejected: 0, errors: [] };
  const session = client.startSession();
  try {
    for await (const row of readRows(workerData.path, workerData.extension)) {
      summary.processed++;
      let data;
      try {
        data = normalize(row);
      } catch (error) {
        summary.rejected++;
        if (summary.errors.length < 100)
          summary.errors.push({ row: summary.processed + 1, message: error.message });
        continue;
      }
      await session.withTransaction(async () => {
        await saveImportRow(db, session, data);
      });
      summary.succeeded++;
    }
  } finally {
    await session.endSession();
  }
  parentPort.postMessage({ ok: true, summary });
} catch (error) {
  parentPort.postMessage({ ok: false, message: error.message });
} finally {
  await client?.close();
}
