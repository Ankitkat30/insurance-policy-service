import { Router } from 'express';
export function createMessageRoutes(controller) {
  const router = Router();
  router.post('/schedule', controller.schedule);
  router.get('/schedules/:id', controller.status);
  router.get('/', controller.list);
  return router;
}
