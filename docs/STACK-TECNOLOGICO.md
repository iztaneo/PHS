# Stack tecnológico PHS

Fecha: 2026-10-03, America/Mexico_City. Estado: selección técnica para el MVP; **TypeScript/React/NestJS confirmados por el usuario el 2026-10-03 y la identidad del MVP se valida en la base de datos** (ver §6 y BIT-0005). Texto original de la propuesta: no se ha instalado ni se ha validado todavía la combinación de dependencias. PostgreSQL está confirmado por el usuario. Se solicitó información sobre restricciones del equipo; al redactar no hay preferencia adicional confirmada.

La decisión y sus alternativas se resumen en [ADR-001](adr/001-stack-mvp.md). Completa la parte de selección de tecnologías de PHS-003; quedan contratos, proveedor de identidad, infraestructura y pruebas de compatibilidad antes de dar esa historia por terminada.

## 1. Selección

| Capa | Tecnología propuesta | Aplicación en PHS |
| --- | --- | --- |
| Lenguaje | TypeScript en modo estricto | UI, API, worker y motor con contratos explícitos. |
| Runtime | Node.js 24 LTS, parche vigente compatible | Misma versión exacta en desarrollo, CI y contenedores. Para CLI Nest 12, al menos 24.15. |
| Frontend | React 19 + Vite + React Router | Aplicación web autenticada, navegación, formularios y tableros. |
| Componentes y estilos | Tailwind CSS + shadcn/ui | Componentes propios a partir de primitivas; adaptar lenguaje visual del prototipo. |
| Consultas y formularios | TanStack Query + React Hook Form + Zod | Datos remotos, estados de carga/error, formularios adaptativos y validación. |
| Backend | NestJS 12 con adaptador Express, módulos ESM | API REST bajo `/api/v1`, casos de uso, autorización y transacciones. |
| Contratos | OpenAPI mediante `@nestjs/swagger`; esquemas Zod | Documentación y cliente tipado; validación en servidor y frontend. |
| Base de datos | PostgreSQL 17, parche vigente de la rama | Modelo relacional, JSONB histórico, restricciones, auditoría y outbox. |
| Acceso a datos | Kysely + `pg` (node-postgres) | Consultas tipadas y transacciones explícitas sobre el SQL existente. |
| Migraciones | dbmate con SQL versionado | Un solo historial de migraciones; conservar triggers e índices particulares del esquema. |
| Motor PHF | Paquete TypeScript independiente + decimal.js | Reglas versionadas, cálculo reproducible y manejo decimal de importes. |
| Procesos automáticos | Worker Node/Nest independiente + outbox PostgreSQL | Evaluaciones, vencimientos, generación de acciones y entregas internas persistentes. |
| Identidad | Credenciales propias validadas en PostgreSQL (MVP); OpenID Connect pospuesto | Usuario y hash de contraseña en la base; adaptador para incorporar OIDC después. |
| Evidencias | Adaptador de archivos privados; interfaz compatible con almacenamiento de objetos | Directorio privado en desarrollo; destino de producción por definir con infraestructura. |
| Pruebas | Vitest, Testing Library, Testcontainers y Playwright | Dominio/componentes, PostgreSQL real y recorridos completos de navegador. |
| Desarrollo y empaquetado | pnpm workspaces + Docker Compose | Un repositorio, dependencias bloqueadas y entorno local reproducible. |
| CI | GitHub Actions | Validación de formato, tipos, pruebas, migraciones y compilación. |

La selección responde a los requisitos de PHS; no es una afirmación de superioridad universal ni de experiencia ya confirmada del equipo. Si aparece una restricción organizacional, revisar ADR-001 antes de crear el esqueleto.

## 2. Versiones y evidencia consultada

Las familias de versiones sirven para tomar la decisión; el primer esqueleto debe resolver y fijar versiones exactas y un lockfile. No usar `latest` flotante en CI o despliegue ni asumir compatibilidad porque dos bibliotecas funcionan por separado.

- Node.js recomienda ramas Active/Maintenance LTS para producción y lista 24 como LTS. Elegimos esa línea. [Política de Node.js](https://nodejs.org/en/about/previous-releases).
- La documentación de React identifica la familia 19; Vite documenta sus requisitos de Node y salida de compilación estática. [React](https://react.dev/versions), [Vite](https://vite.dev/guide/).
- Nest 12 distingue requisitos del runtime y CLI; su documentación indica 24.15+ para generar con la línea Node 24, módulos ESM y soporte de pruebas ESM con Vitest. La integración se validará con todos los paquetes `@nestjs/*` en versiones compatibles. [Guía Nest 12](https://docs.nestjs.com/migration-guide).
- PostgreSQL 17 sigue soportado. El esquema fue probado localmente en 17.9, pero eso no fija el parche de producción: se utilizará el parche vigente de 17 y se repetirán pruebas sobre él. [Política PostgreSQL](https://www.postgresql.org/support/versioning/).
- shadcn/ui documenta su instalación sobre Vite; Zod permite validar datos y TanStack Query gestiona estado remoto. Estas herramientas no implementan por sí mismas permisos ni las reglas PHF. [shadcn/ui](https://ui.shadcn.com/docs/installation/vite), [Zod](https://zod.dev/), [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview).

## 3. Estructura del repositorio a implementar

```text
apps/
  web/                React: navegación, formularios y vistas
  api/                Nest: HTTP, sesión, autorización y casos de uso
  worker/             Nest: consumo de trabajos y reconciliación periódica
packages/
  domain/             Entidades y reglas de transición sin infraestructura
  health-engine/      Cálculos PHF y ejemplos aprobados de D01
  contracts/          Esquemas de entrada/salida y tipos compartibles
  persistence/        Kysely, repositorios y unidad de trabajo
  application/        Casos de uso reutilizados por API y worker
  test-support/       Fixtures, reloj controlado y utilidades de pruebas
  config/             Configuración común de herramientas
 db/                  Migraciones SQL y pruebas de integridad existentes
 docs/                Especificaciones, decisiones, ADR y bitácora
```

Es una estructura propuesta; esas aplicaciones y paquetes aún no existen. API y worker forman parte del mismo backend modular, comparten dominio y despliegan la misma versión de negocio. No se convierten en microservicios por correr en procesos distintos. La separación evita que una operación HTTP larga detenga el procesamiento de vencimientos y permite administrar ambos procesos.

`domain` y `health-engine` no importan React, Nest, red ni base de datos. `web` puede compartir contratos públicos, pero no recibe módulos de persistencia ni secretos. Los importes se transportan como decimales serializados de forma explícita y se calculan con una política común de precisión; no convertir `numeric` a `Number` indiscriminadamente. [decimal.js](https://mikemcl.github.io/decimal.js/).

## 4. Persistencia y migraciones

Kysely ofrece consultas SQL tipadas; se adapta a un diseño cuyo contrato ya está expresado mediante SQL, claves compuestas, índices parciales y triggers. `pg` proporciona el driver PostgreSQL. Las transacciones deben utilizar el mismo contexto/conexión para todas sus operaciones. [Kysely](https://kysely.dev/), [transacciones node-postgres](https://node-postgres.com/features/transactions).

Reglas del proyecto:

1. SQL versionado es la fuente de verdad del esquema. No habilitar sincronización automática de tablas al arrancar.
2. dbmate será el único ejecutor de migraciones de la aplicación; no combinar su historial con otro generador de esquema. [Documentación dbmate](https://github.com/amacneil/dbmate).
3. PHS-004 adaptará la migración inicial al formato de dbmate, definiendo una sola fuente canónica y el manejo de la transacción existente. No envolver ciegamente `BEGIN/COMMIT` en otra transacción del runner. Si ya hubiera una base aplicada, establecer su baseline en el historial solo después de verificar equivalencia del esquema; no reaplicar `CREATE SCHEMA`.
4. No se cambió la migración inicial en esta decisión. La adaptación deberá pasar sobre una base vacía y sobre el escenario de actualización acordado; incluirá el procedimiento de recuperación sin un `down` destructivo de producción.
5. Generar o verificar tipos de persistencia contra una base construida desde migraciones, para detectar divergencia entre TypeScript y SQL.
6. El comando de negocio conserva datos, auditoría y outbox en una misma transacción. Las decisiones y correcciones históricas requieren sus casos de uso, no actualizaciones genéricas.

## 5. Worker y calendario

El esquema ya tiene `outbox_message`, claves de deduplicación y estados de procesamiento. La propuesta inicial es usarlo como bandeja persistente y ejecutar un worker separado; no introducir otra base para sostener la cola del MVP.

El consumidor reserva lotes con transacciones cortas y `FOR UPDATE SKIP LOCKED`, lease y reintentos. PostgreSQL documenta `SKIP LOCKED` para evitar contención en consumidores de tablas tipo cola; no debe usarse para obtener una vista consistente de datos generales. [SELECT y locking](https://www.postgresql.org/docs/17/sql-select.html).

La implementación deberá cubrir explícitamente:

- Reclamo atómico, identidad del reclamo, renovación de lease y prevención de confirmación por un worker cuyo lease expiró. El esquema actual puede requerir columnas adicionales en PHS-033.
- Entrega **al menos una vez**; efectos idempotentes por evento/tarea/evaluación. No prometer ejecución exactamente una vez.
- Reintentos con espera creciente y límite, trabajos fallidos visibles, métricas de retraso y recuperación tras reinicio.
- Reconciliación periódica de vencimientos por fecha del proyecto, separada de la vida de una sesión web. Un tick repetido crea trabajo con clave estable por proyecto/periodo.
- Control de revisión del proyecto antes de publicar una evaluación; un trabajo antiguo no reemplaza un resultado nuevo.
- Acciones externas fuera de transacciones largas; si el receptor admite clave idempotente, enviarla. Duplicación potencial de entregas externas requiere política cuando esas integraciones entren al alcance.

Esta elección ahorra un servicio de infraestructura, pero obliga a implementar y probar el protocolo del consumidor. Si las mediciones del piloto muestran que no resulta suficiente, evaluar una librería de cola o broker en una nueva ADR.

## 6. Identidad y autorización

**Decisión del usuario, 2026-10-03:** en el MVP la identidad se valida en la base de datos de la aplicación; OIDC queda pospuesto. Lo que sigue sobre OIDC se conserva como diseño de la integración futura. La sesión de servidor con cookie, el mismo origen y la verificación de permisos en cada caso de uso se mantienen.

Para la credencial local, PHS-005 debe definir: tabla de credenciales separada de `app_user`, hash con algoritmo resistente (por ejemplo Argon2id) y parámetros registrados, alta por administrador, cambio y restablecimiento de contraseña, límite de intentos, mensajes que no revelen si el usuario existe y ausencia total de contraseñas en logs, auditoría y respuestas. Durante el piloto se permite la autoaprobación auditada (D05).

Se propone OIDC con Authorization Code y PKCE, integrado desde el backend con `openid-client`; el proveedor corporativo sigue pendiente. La biblioteca implementa cliente OAuth/OIDC, no un directorio de usuarios ni los permisos de negocio. [openid-client](https://github.com/panva/openid-client).

La API mantendrá sesión de servidor y entregará cookie `HttpOnly`, `Secure` en HTTPS, con política SameSite y protección CSRF acordes al flujo. Las sesiones persistentes requieren tabla y adaptador definidos en PHS-005; no están en las 28 tablas de negocio originales. El backend valida emisor, audiencia, estado/nonce y caducidad mediante la biblioteca y el protocolo correspondiente.

El frontend no guarda tokens de acceso en localStorage. Proponemos servir web y `/api` bajo el mismo origen para simplificar sesión y despliegue. Los permisos por práctica/proyecto se verifican en cada caso de uso según D05, con independencia de los roles que presente el proveedor.

No se elige arbitrariamente Microsoft, Google o un IdP autogestionado sin conocer la organización. Para pruebas se usa un proveedor de prueba aislado o fixture controlado que no esté habilitado en producción. La ausencia de proveedor bloquea aceptación del acceso real, no el diseño del motor o la base.

## 7. UI, contratos y archivos

React organiza la UI por capacidades del backlog. TanStack Query maneja consultas, invalidación y estado de mutaciones; los formularios mantienen su borrador explícitamente, incluido el borrador persistente del servidor cuando corresponda. El estilo del prototipo se reproduce con componentes mantenibles y pruebas de teclado/foco.

Zod define contratos de entrada/salida validados en el servidor. OpenAPI documenta los endpoints con `@nestjs/swagger`; la generación y pruebas deben impedir que el documento y los esquemas usados realmente diverjan. Los checks SQL siguen siendo autoridad sobre integridad. [OpenAPI en Nest](https://docs.nestjs.com/openapi/introduction).

Evidencias se guardan fuera de tablas transaccionales; PostgreSQL conserva metadatos y autorización. En local se propone directorio privado con adaptador; en producción, almacenamiento privado de objetos con respaldo, límites y política D09. El proveedor queda pendiente de D06. La carga debe poder fallar sin dejar evidencia marcada como disponible; un proceso limpia archivos huérfanos según retención acordada.

## 8. Pruebas, CI y operación

- Vitest para reglas puras y componentes; Testing Library para comportamiento de interfaz. Mantener un reloj inyectable en los casos de fecha. [Vitest](https://vitest.dev/guide/).
- Testcontainers para pruebas de integración con PostgreSQL de la misma familia objetivo; probar transacciones, restricciones y concurrencia real. Las pruebas SQL existentes se conservan. [Módulo PostgreSQL](https://node.testcontainers.org/modules/postgresql/).
- Playwright para escenarios AT-01–AT-18 según cobertura viable, con fixtures y usuarios de prueba. [Playwright](https://playwright.dev/docs/intro).
- pnpm workspaces para el monorepo y lockfile versionado. El pipeline instalará con lockfile congelado. [Workspaces](https://pnpm.io/workspaces).
- GitHub Actions para verificar formato, tipos, pruebas y build; no supone despliegue automático a producción. [GitHub Actions](https://docs.github.com/en/actions/get-started/understand-github-actions).
- Logs JSON con request/job ID, endpoints de salud, métricas de errores y edad de trabajos; proveedor de monitorización y alertas operativas en D07. La auditoría del negocio permanece en PostgreSQL.

Desarrollo: Docker Compose para PostgreSQL y servicios de apoyo; web/API/worker pueden correr localmente con recarga. Piloto: imágenes Docker separadas para web, API y worker, un reverse proxy/ingress del entorno y PostgreSQL persistente con restauración probada. Se definirá proveedor y sizing cuando se conozcan usuarios/concurrencia. Compose permite describir servicios de una aplicación; no proporciona por sí solo alta disponibilidad o una política de respaldos. [Docker Compose](https://docs.docker.com/compose/).

No se han contratado servicios, creado pipelines ni instalado paquetes en esta etapa. No se estiman costos de hosting sin proveedor, volumen y requisitos operativos.

## 9. Cierre pendiente de D06 / PHS-003

La selección de tecnologías queda documentada. Para convertirla en base ejecutable:

1. ~~Confirmar restricciones del equipo sobre lenguajes~~ — confirmado el 2026-10-03: TypeScript/React/NestJS, equipo de una persona. Sigue pendiente la infraestructura.
2. Definir entorno de despliegue, almacenamiento y volumen piloto. Identidad del MVP: validada en la base de datos (decidido el 2026-10-03).
3. Fijar versiones exactas compatibles: Node 24, Nest 12 y paquetes relacionados, React 19, Vite, TypeScript y herramientas; compilar y ejecutar una prueba mínima de punta a punta.
4. Completar OpenAPI y contratos JSON iniciales, patrón de sesión y protocolo del worker.
5. En PHS-004 adaptar migraciones y agregar únicamente las brechas decididas; conservar trazabilidad.

Prueba mínima futura: web consulta API autenticada, API lee PostgreSQL, comando crea dato + outbox de forma atómica, worker consume idempotentemente y UI muestra resultado. Que la documentación de cada herramienta admita estas capacidades no prueba por sí solo que nuestra integración funcione.
