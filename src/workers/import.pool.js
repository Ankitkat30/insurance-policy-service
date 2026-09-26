import { Worker } from 'node:worker_threads';
export class ImportPool {
  constructor(config) {
    this.config = config;
    this.workers = new Set();
    this.closing = false;
  }
  get available() {
    return !this.closing && this.workers.size < this.config.MAX_IMPORT_WORKERS;
  }
  run(path, extension) {
    if (!this.available)
      return Promise.reject(
        Object.assign(new Error('Import capacity reached; retry later'), { status: 503 }),
      );
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./import.worker.js', import.meta.url), {
        workerData: {
          path,
          extension,
          config: { MONGODB_URI: this.config.MONGODB_URI, DB_NAME: this.config.DB_NAME },
        },
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      });
      this.workers.add(worker);
      let result;
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(
          Object.assign(new Error('Import timed out; committed rows can be safely re-imported'), {
            status: 504,
          }),
        );
      }, 120000);
      worker.on('message', (message) => {
        result = message;
      });
      worker.on('error', reject);
      worker.on('exit', (code) => {
        clearTimeout(timeout);
        this.workers.delete(worker);
        if (code === 0 && result?.ok) resolve(result.summary);
        else
          reject(
            Object.assign(
              new Error(result?.message || 'Import worker interrupted; safe to retry'),
              { status: 422 },
            ),
          );
      });
    });
  }
  async close() {
    this.closing = true;
    await Promise.all([...this.workers].map((worker) => worker.terminate()));
  }
}
