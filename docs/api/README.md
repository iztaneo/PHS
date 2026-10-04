# Contratos de API (OpenAPI 3.1)

Generados desde `packages/contracts`; no se editan a mano. Hay un contrato por servicio, conforme a [ADR-002](../adr/002-microservicios.md).

| Documento | Audiencia | Contenido |
| --- | --- | --- |
| [gateway.openapi.json](gateway.openapi.json) | Pública: la aplicación web | Sesión, estado y todo lo que el gateway reenvía a los servicios bajo `/api/v1`. Autenticación por cookie `phs_session`. |
| [identity.openapi.json](identity.openapi.json) | Interna | Sesiones, contraseña y administración de usuarios, prácticas y roles. Solo el gateway puede llamarla, con su firma. |
| [projects.openapi.json](projects.openapi.json) | Interna | Proyectos por alcance y catálogo de tipos de servicio. Recibe la identidad firmada del usuario. |

## Cómo se mantiene

1. Cada ruta se declara en `packages/contracts/src/<servicio>.ts` con su método, autenticación, parámetros, cuerpo, respuestas y códigos de error. Los esquemas son Zod.
2. Los controladores validan los cuerpos con esos mismos esquemas, de modo que el contrato y la validación tienen una sola fuente.
3. `npx pnpm@12.9.1 api:docs` regenera estos archivos.

Las pruebas fallan si algo diverge:

- `packages/contracts`: los archivos de esta carpeta deben coincidir con los contratos; cada ruta declara una respuesta correcta y un esquema para cada error; el contrato público no expone rutas internas de sesión ni tokens.
- `apps/*/test/contract.test.ts`: las rutas que cada servicio registra en NestJS deben ser exactamente las del contrato.
- Las pruebas de integración validan respuestas reales contra los esquemas en modo estricto.

## Consultarlos en local

Con `API_DOCS=true` en `.env` y los servicios levantados:

- Swagger UI del contrato público: <http://127.0.0.1:5173/api/docs/>
- JSON público: <http://127.0.0.1:3000/api/openapi.json>
- JSON internos: <http://127.0.0.1:3001/openapi.json> (Identidad) y <http://127.0.0.1:3002/openapi.json> (Proyectos)

Fuera de desarrollo local, `API_DOCS` no debe activarse.

## Convenciones

- Errores: cuerpo `{ "code": "..." }` con un código estable; el mensaje al usuario lo decide el cliente.
- Un recurso fuera del alcance del usuario responde 404, igual que uno inexistente.
- Aún no definidos, porque ninguna ruta actual los necesita: paginación, filtros, versión esperada para concurrencia y clave de idempotencia. Se añadirán al contrato con PHS-008 y PHS-009.
