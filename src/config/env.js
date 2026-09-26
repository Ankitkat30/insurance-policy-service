import { z } from 'zod';
const integer = (fallback, min, max) => z.coerce.number().int().min(min).max(max).default(fallback);
export function config(env = process.env) {
  return z
    .object({
      PORT: integer(3000, 0, 65535),
      HOST: z.string().default('127.0.0.1'),
      MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/?replicaSet=rs0'),
      DB_NAME: z
        .string()
        .regex(/^[a-zA-Z0-9_-]+$/)
        .default('insurance_assessment'),
      API_KEY: z.string().min(16).optional(),
      CPU_THRESHOLD: z.coerce.number().positive().max(100).default(70),
      CPU_INTERVAL_MS: integer(1000, 100, 60000),
      SCHEDULER_INTERVAL_MS: integer(1000, 50, 60000),
      MAX_IMPORT_WORKERS: integer(2, 1, 8),
      UPLOAD_DIR: z.string().default('./work/uploads'),
    })
    .parse(env);
}
