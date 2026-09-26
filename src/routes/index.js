import { Router } from 'express';
import { createPolicyRoutes } from './policy.routes.js';
import { createMessageRoutes } from './message.routes.js';
import { createImportRoutes } from './import.routes.js';
import { createPolicyController } from '../controllers/policy.controller.js';
import { createMessageController } from '../controllers/message.controller.js';
import { createImportController } from '../controllers/import.controller.js';
import { createPolicyService } from '../services/policy.service.js';
import { createMessageService } from '../services/message.service.js';
import { createImportService } from '../services/import.service.js';
import { createPolicyRepository } from '../repositories/policy.repository.js';
import { createMessageRepository } from '../repositories/message.repository.js';
import { createUploadMiddleware, requireImportCapacity } from '../middleware/upload.middleware.js';
export async function createApiRoutes({ db, pool, config }) {
  const router = Router();
  router.use(
    '/policies',
    createPolicyRoutes(createPolicyController(createPolicyService(createPolicyRepository(db)))),
  );
  router.use(
    '/messages',
    createMessageRoutes(createMessageController(createMessageService(createMessageRepository(db)))),
  );
  router.use(
    '/imports',
    createImportRoutes(createImportController(createImportService(pool)), {
      capacity: requireImportCapacity(pool),
      upload: await createUploadMiddleware(config),
    }),
  );
  return router;
}
