import { z } from 'zod';
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const searchSchema = paginationSchema.extend({
  username: z
    .string()
    .trim()
    .min(1)
    .max(254)
    .transform((value) => value.toLowerCase()),
});
export const identifierSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid identifier');
export const messageQuerySchema = paginationSchema.extend({ jobId: identifierSchema.optional() });
