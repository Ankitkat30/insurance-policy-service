import { z } from 'zod';
import multer from 'multer';
export function notFound(_req, res) {
  res.status(404).json({ error: 'Route not found' });
}
export function errorHandler(error, _req, res, _next) {
  if (error instanceof z.ZodError)
    return res.status(400).json({
      error: 'Validation failed',
      details: error.issues.map(({ path, message }) => ({ path, message })),
    });
  if (error instanceof multer.MulterError)
    return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.message });
  const status = error.status || 500;
  if (status >= 500)
    console.error(
      JSON.stringify({
        event: 'request_failed',
        requestId: res.get('X-Request-Id'),
        code: error.code ?? 'INTERNAL',
      }),
    );
  res
    .status(status)
    .json({ error: status >= 500 ? 'Service unavailable; retry later' : error.message });
}
