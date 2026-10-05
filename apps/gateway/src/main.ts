import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { hostFromEnv, loadEnv, portFromEnv } from '@phs/service-kit';
import { json } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { openApiDocuments } from '@phs/contracts';
import swaggerUi from 'swagger-ui-express';
import { AppModule } from './app.module.js';
import { authenticate } from './authenticate.js';
import { allowedOrigins, assignRequestId, checkOrigin } from './http.js';
import { IdentityClient } from './identity.client.js';
import { proxiedRoutes } from './routes.js';

loadEnv();
// Global body parsing stays off so proxied request bodies reach the services untouched.
const app = await NestFactory.create(AppModule, { bodyParser: false });
app.enableShutdownHooks();
app.use(assignRequestId);
app.use('/api', checkOrigin(allowedOrigins()));
app.use('/api/v1/session', json({ limit: '10kb' }));
if (process.env.API_DOCS === 'true') {
  // Local development only: browsable public contract at /api/docs.
  const document = openApiDocuments.gateway();
  app.use('/api/openapi.json', (_request: unknown, response: { json: (body: unknown) => void }) => response.json(document));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(document));
}
const identity = app.get(IdentityClient);
for (const route of proxiedRoutes()) {
  app.use(route.prefix, authenticate(identity), createProxyMiddleware({ target: route.target, changeOrigin: true }));
}
await app.listen(portFromEnv('GATEWAY_PORT', 3000), hostFromEnv());
