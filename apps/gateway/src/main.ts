import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadEnv, portFromEnv } from '@phs/service-kit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { AppModule } from './app.module.js';
import { serviceRoutes } from './routes.js';

loadEnv();
// Body parsing stays off so proxied request bodies reach the services untouched.
const app = await NestFactory.create(AppModule, { bodyParser: false });
app.enableShutdownHooks();
for (const route of serviceRoutes()) {
  // Express strips the mount prefix, so /api/v1/identity/x reaches the service as /x.
  app.use(route.prefix, createProxyMiddleware({ target: route.target, changeOrigin: true }));
}
await app.listen(portFromEnv('GATEWAY_PORT', 3000), '127.0.0.1');
