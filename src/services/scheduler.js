import { deliverNextJob } from '../repositories/delivery.repository.js';
export async function deliverDue(db, client, now = new Date()) {
  let delivered = 0;
  for (let i = 0; i < 100; i++) {
    const session = client.startSession();
    let found = false;
    try {
      await session.withTransaction(async () => {
        found = false;
        found = await deliverNextJob(db, session, now);
      });
    } finally {
      await session.endSession();
    }
    if (!found) break;
    delivered++;
  }
  return delivered;
}
export function startScheduler(db, client, interval, logger = console) {
  let stopped = false,
    timer,
    active = Promise.resolve();
  function tick() {
    active = deliverDue(db, client)
      .catch(() => logger.error('Message delivery failed; retrying on next poll'))
      .finally(() => {
        if (!stopped) timer = setTimeout(tick, interval);
      });
  }
  tick();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await active;
  };
}
