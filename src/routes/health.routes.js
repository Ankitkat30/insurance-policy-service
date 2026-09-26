import { Router } from 'express';
export function createHealthRoutes(db, metrics) {
  const router = Router();
  router.get('/', async (_req, res) => {
    await db.command({ ping: 1 });
    res.json({
      status: 'ok',
      cpuPercent: metrics.cpuPercent ?? 0,
      uptimeSeconds: process.uptime(),
    });
  });
  return router;
}
