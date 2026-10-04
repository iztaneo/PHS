import { gatewayOwnRoutes, publicRoutes } from './gateway.js';
import { identityRoutes } from './identity.js';
import { buildOpenApi } from './openapi.js';
import { projectsRoutes } from './projects.js';

// One contract per service (ADR-002); the gateway publishes the only one the browser uses.
export const openApiDocuments = {
  gateway: () => buildOpenApi({
    title: 'PHS — API pública (gateway)',
    description: 'Contrato que usa la aplicación web. Toda ruta entra por el gateway, que valida la sesión y reenvía a los servicios.',
    audience: 'public',
  }, publicRoutes),
  identity: () => buildOpenApi({
    title: 'PHS — Servicio Identidad (interno)',
    description: 'API interna. Solo el gateway puede llamarla, con su firma. Las rutas de administración exigen además un usuario administrador.',
    audience: 'internal',
  }, identityRoutes),
  projects: () => buildOpenApi({
    title: 'PHS — Servicio Proyectos (interno)',
    description: 'API interna. Recibe del gateway la identidad firmada del usuario y aplica el alcance de D05.',
    audience: 'internal',
  }, projectsRoutes),
} as const;

export type ServiceName = keyof typeof openApiDocuments;
export const ownRoutes = { gateway: gatewayOwnRoutes, identity: identityRoutes, projects: projectsRoutes } as const;
