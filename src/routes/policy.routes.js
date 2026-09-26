import { Router } from 'express';
export function createPolicyRoutes(controller) {
  const router = Router();
  router.get('/search', controller.search);
  router.get('/aggregate', controller.aggregate);
  return router;
}
