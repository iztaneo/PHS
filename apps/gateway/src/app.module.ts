import { Module } from '@nestjs/common';
import { IdentityClient } from './identity.client.js';
import { monitoredServices } from './routes.js';
import { SessionController } from './session.controller.js';
import { StatusController } from './status.controller.js';
import { SERVICE_ROUTES, StatusService } from './status.service.js';

@Module({
  controllers: [StatusController, SessionController],
  providers: [StatusService, IdentityClient, { provide: SERVICE_ROUTES, useFactory: monitoredServices }],
})
export class AppModule {}
