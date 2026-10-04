import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadEnv, portFromEnv } from '@phs/service-kit';
import { json } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
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
const identity = app.get(IdentityClient);
for (const route of proxiedRoutes()) {
  // Express strips the mount prefix, so /api/v1/projects/x reaches the service as /x.
  app.use(route.prefix, authenticate(identity), createProxyMiddleware({ target: route.target, changeOrigin: true }));
}
await app.listen(portFromEnv('GATEWAY_PORT', 3000), '127.0.0.1');
