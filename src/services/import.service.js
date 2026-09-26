import { unlink } from 'node:fs/promises';
import { extname } from 'node:path';
import { HttpError } from '../utils/http-error.js';
export function createImportService(pool) {
  return {
    async upload(file) {
      if (!file)
        throw new HttpError(
          400,
          'Attach a CSV or XLSX using Body > form-data, field name file (type File).',
        );
      try {
        return await pool.run(file.path, extname(file.originalname).toLowerCase());
      } finally {
        await unlink(file.path).catch(() => {});
      }
    },
  };
}
