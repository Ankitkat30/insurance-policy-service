import test from 'node:test';
import assert from 'node:assert/strict';
import { cpuPercent } from '../src/services/cpu.js';
import { scheduleInput } from '../src/validators/message.schema.js';
import { date, normalize } from '../src/validators/import.schema.js';
import { config } from '../src/config/env.js';
test('CPU includes user and system time and is measured against one core', () => {
  assert.equal(cpuPercent({ user: 600000, system: 100000 }, 1000000), 70);
  assert.equal(cpuPercent({ user: 1500000, system: 0 }, 1000000), 150);
  assert.equal(cpuPercent({ user: 0, system: 0 }, 0), 0);
});
test('calendar dates reject rollover', () => {
  assert.throws(() => date('2026-02-30', 'dob'));
  assert.equal(date('2000-02-29', 'dob').toISOString(), '2000-02-29T00:00:00.000Z');
});
test('scheduling converts timezone and rejects past, malformed and DST ambiguities', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const input = { message: 'hello', day: '2026-09-27', time: '15:30', timezone: 'Asia/Kolkata' };
  assert.equal(scheduleInput(input, now).scheduledAt.toISOString(), '2026-09-27T10:00:00.000Z');
  for (const changes of [
    { day: '2025-01-01' },
    { day: '2026-02-30' },
    { time: '25:00' },
    { timezone: 'invalid' },
    { message: '' },
    { extra: 1 },
    { day: '2026-03-08', time: '02:30', timezone: 'America/New_York' },
    { day: '2026-11-01', time: '01:30', timezone: 'America/New_York' },
  ]) {
    assert.throws(() => scheduleInput({ ...input, ...changes }, now));
  }
});
test('invalid configuration fails instead of silently disabling limits', () => {
  assert.equal(config({}).CPU_THRESHOLD, 70);
  assert.throws(() => config({ MAX_IMPORT_WORKERS: '0' }));
  assert.throws(() => config({ CPU_THRESHOLD: '101' }));
});
