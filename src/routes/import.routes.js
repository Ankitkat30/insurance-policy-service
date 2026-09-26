import { Router } from 'express';
export function createImportRoutes(controller, { capacity, upload }) {
  const router = Router();
  router.post('/', capacity, upload, controller.upload);
  return router;
}
