import { createHealthRoutes } from './routes/health.routes.js';
import express from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { createApiRoutes } from './routes/index.js';
import { authenticate } from './middleware/auth.middleware.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';
export async function createApp({ db, pool, config, metrics = {} }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use((_req, res, next) => {
    res.set('X-Request-Id', randomUUID());
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.use('/health', createHealthRoutes(db, metrics));
  app.use('/api', authenticate(config.API_KEY), await createApiRoutes({ db, pool, config }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
