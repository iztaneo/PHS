import { Module } from '@nestjs/common';
import { StatusController } from './status.controller.js';
import { SERVICE_ROUTES, StatusService } from './status.service.js';
import { serviceRoutes } from './routes.js';

@Module({
  controllers: [StatusController],
  providers: [StatusService, { provide: SERVICE_ROUTES, useFactory: serviceRoutes }],
})
export class AppModule {}
