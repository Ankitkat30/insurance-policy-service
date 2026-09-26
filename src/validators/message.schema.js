import { DateTime, IANAZone } from 'luxon';
import { z } from 'zod';
const schema = z
  .object({
    message: z.string().trim().min(1).max(10000),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    timezone: z.string().default('UTC'),
  })
  .strict();
export function scheduleInput(body, now = new Date()) {
  const input = schema.parse(body);
  if (!IANAZone.isValidZone(input.timezone))
    throw Object.assign(new Error('Invalid IANA timezone'), { status: 400 });
  const text = `${input.day}T${input.time}`;
  const date = DateTime.fromISO(text, { zone: input.timezone });
  if (
    !date.isValid ||
    date.toFormat(input.time.length === 5 ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd'T'HH:mm:ss") !==
      text ||
    date.getPossibleOffsets().length !== 1
  ) {
    throw Object.assign(new Error('Invalid or ambiguous local day/time'), { status: 400 });
  }
  if (date.toMillis() <= now.getTime())
    throw Object.assign(new Error('Scheduled time must be in the future'), { status: 400 });
  return {
    message: input.message,
    timezone: input.timezone,
    scheduledAt: date.toJSDate(),
    status: 'pending',
    createdAt: now,
  };
}
