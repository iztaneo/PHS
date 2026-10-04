import { Controller, Get, NotFoundException } from '@nestjs/common';
import { openApiDocuments } from '@phs/contracts';

// Serves this service's contract while API_DOCS=true (local development). Hidden otherwise.
@Controller('openapi.json')
export class OpenApiController {
  @Get()
  document(): Record<string, unknown> {
    if (process.env.API_DOCS !== 'true') throw new NotFoundException();
    return openApiDocuments.platform();
  }
}
