import multer from 'multer';
import { mkdir } from 'node:fs/promises';
import { extname } from 'node:path';
import { HttpError } from '../utils/http-error.js';
export async function createUploadMiddleware(config) {
  await mkdir(config.UPLOAD_DIR, { recursive: true, mode: 0o700 });
  const upload = multer({
    dest: config.UPLOAD_DIR,
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
    fileFilter: (_req, file, cb) => {
      if (!['.csv', '.xlsx'].includes(extname(file.originalname).toLowerCase()))
        return cb(new HttpError(400, 'Only CSV and XLSX files are supported'));
      cb(null, true);
    },
  });
  return upload.single('file');
}
export function requireImportCapacity(pool) {
  return (_req, res, next) => {
    if (!pool.available)
      return res
        .status(503)
        .set('Retry-After', '5')
        .json({ error: 'Import capacity reached; retry later' });
    next();
  };
}
