import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { hostFromEnv, loadEnv, portFromEnv } from '@phs/service-kit';
import { AppModule } from './app.module.js';

loadEnv();
const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
// Internal service: reachable only from the gateway, never from the browser.
await app.listen(portFromEnv('PLATFORM_PORT', 3004), hostFromEnv());
