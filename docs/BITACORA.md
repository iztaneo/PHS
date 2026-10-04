# Bitácora del proyecto PHS

Memoria compartida de lo realizado, las decisiones, la validación y el trabajo pendiente. Este archivo se actualiza en el mismo commit que cada cambio, conforme a [AGENTS.md](../AGENTS.md).

## Estado actual para retomar

- **Producto:** Project Health System, para gobernar la salud de proyectos y servicios mediante PHF.
- **Disponible:** prototipo HTML, diagnóstico, arquitectura propuesta, diseño PostgreSQL, migraciones 001–005 aplicadas con dbmate (inicial, credencial local, sesiones, endurecimiento y roles por servicio), pruebas de integridad, especificación funcional, backlog y plan de entregas.
- **Aplicación ejecutable:** monorepo pnpm con `apps/web`, `apps/gateway`, `apps/identity`, `apps/projects` y `packages/service-kit`; ver README para arrancarlo.
- **Implementado (en revisión, sin aceptar):** PHS-005 — inicio y cierre de sesión, cambio de contraseña obligatorio, bloqueo por intentos e identidad firmada del gateway hacia los servicios (BIT-0011).
- **Todavía no implementado:** permisos por práctica/proyecto, administración de usuarios, funcionalidad de negocio, servicios Salud y Plataforma, motor de producción y procesos programados.
- **Arquitectura decidida:** microservicios — gateway y cuatro servicios (Identidad, Proyectos, Salud, Plataforma) sobre un PostgreSQL compartido con el esquema actual; REST y eventos por outbox. Ver [ADR-002](adr/002-microservicios.md) y [mapa de trazabilidad](MAPA-TRAZABILIDAD.md).
- **Decisiones confirmadas:** PostgreSQL como base del MVP; stack TypeScript/React/NestJS; identidad del MVP validada en la base de datos (OIDC pospuesto); autoaprobación permitida y auditada durante el piloto. El equipo es una sola persona que desarrolla y aprueba.
- **Stack:** TypeScript, React/Vite, NestJS en cada servicio, PostgreSQL 17, Kysely/pg, migraciones SQL/dbmate y Docker. Ver [stack](STACK-TECNOLOGICO.md) y [ADR-001](adr/001-stack-mvp.md); no está instalado y faltan infraestructura, volumen piloto y versiones exactas.
- **Supuesto no confirmado:** una empresa con varias prácticas. No se ha aprobado alcance SaaS multiempresa.
- **Backlog:** 45 elementos propuestos, 42 para el MVP y 3 posteriores; 175 criterios de aceptación desde BIT-0008. Ninguna historia se considera implementada por la existencia de estos documentos.
- **Decisiones abiertas:** D01–D04 y D07–D10 completas; D05 y D06 parcialmente confirmadas. Ver [DECISIONES.md](producto/DECISIONES.md).
- **Hallazgos de BIT-0005:** textos vacíos, borrado físico y fecha de outbox corregidos en la migración 004; el resto clasificado en [DECISIONES.md](producto/DECISIONES.md).
- **Repositorio:** local en `/Users/indra/Documents/ChatGPT/PHS`, rama `main`; remoto `origin` en [iztaneo/PHS](https://github.com/iztaneo/PHS), creado y verificado como privado. La publicación y sincronización de commits se comprueban con Git (`git status -sb`, `git ls-remote origin refs/heads/main`).
- **Puntos abiertos de la arquitectura:** protocolo de envío de revisión entre Salud y Proyectos; rotación del secreto interno y aislamiento de red entre servicios.
- **Entorno local sin Docker:** `db:setup` crea un PostgreSQL propio en `.local/pg` (puerto 54329), aplica migraciones y crea usuarios de desarrollo; ver README.
- **Siguiente paso funcional:** PHS-006 (permisos por práctica y proyecto; requiere cerrar el alcance de D05) y PHS-007 (administración de usuarios y prácticas), luego PHS-008 (auditoría y concurrencia). D01 y D02 pueden resolverse antes de R2/R3.

## Cómo se mantiene

1. Crear una entrada `BIT-NNNN` con cada conjunto de cambios que se vaya a confirmar.
2. Describir lo que realmente cambió y sus pruebas; indicar lo que no se probó y cualquier decisión pendiente.
3. Actualizar el estado para retomar y agregar entrada, código y documentos en el mismo commit.
4. Incluir el ID en el mensaje de commit. Localizarlo después con `git log --all --grep='BIT-NNNN'`; no es necesario modificar el documento para agregar su propio hash.
5. Comprobar estado y subir al remoto autorizado. Si falla o falta el remoto, conservar trabajo local e informar el pendiente.

Las fechas usan `America/Mexico_City` (UTC−06:00 en estas entradas). Las entradas previas a la creación de esta bitácora se reconstruyen a partir de archivos, historial Git y trabajo registrado en esta conversación; no se presentan como anotaciones contemporáneas.

## BIT-0001 — Revisión, arquitectura, PostgreSQL y repositorio inicial

**Fecha:** 2026-10-03, America/Mexico_City. Entrada retrospectiva.

**Commit existente:** `598728c` — `Initial PHS prototype, architecture and PostgreSQL schema`, registrado el 2026-10-03 a las 20:03:23 UTC−06:00. Este commit precede a la convención BIT.

**Objetivo:** entender los materiales existentes y preparar la base para construir la aplicación.

### Trabajo realizado

- Se revisaron `phf.html`, `flujo-phf.html`, `index.html`, la guía y los scripts del prototipo. Se identificaron las once etapas y la lógica del modelo de salud.
- Se comprobó por inspección que el prototipo usa localStorage y simula roles; `app.py` solo sirve archivos estáticos.
- Se documentaron arquitectura modular, responsabilidades, datos, procesos críticos y entregas propuestas.
- A petición del usuario se diseñó PostgreSQL con 28 tablas, claves foráneas, restricciones, snapshots e historial protegido contra modificaciones ordinarias.
- Se creó una migración transaccional y un escenario de pruebas con recorrido válido y 11 rechazos esperados de integridad.
- Se aprovechó el repositorio Git local vacío existente y se creó el primer commit en `main`, con README y exclusiones para archivos locales y secretos.

### Archivos y referencias

- [Prototipo](../Project-Health-System-Prototype/README.md).
- [Arquitectura](ARQUITECTURA-PHS.md).
- [Diseño de base de datos](DATABASE-PHS.md).
- [Migración inicial](../db/migrations/001_initial.sql).
- [Pruebas de integridad](../db/tests/001_integrity.sql).
- [README](../README.md) y [.gitignore](../.gitignore).

### Decisiones y validación

- PostgreSQL fue solicitado como base por el usuario. Lenguaje, frameworks, proveedor de identidad e infraestructura no fueron seleccionados.
- La migración y pruebas pasaron en una instancia temporal aislada de PostgreSQL 17.9. Las filas del escenario se revirtieron y la instancia se detuvo.
- Se comprobaron referencias entre proyectos, protección del historial, fechas, decisiones duplicadas, score, duplicación de eventos y cierre de tareas. El texto del aviso de pruebas se corrigió de 12 a 11 para coincidir con las comprobaciones existentes.
- No se alteraron bases de negocio. No se ejecutaron pruebas de carga, concurrencia entre sesiones ni pruebas funcionales completas del prototipo en navegador.
- El commit inicial dejó el árbol de trabajo limpio y no configuró remoto.

### Pendientes al cierre de esta etapa

Especificar el producto y backlog, validar reglas de negocio y elegir stack. El diseño de tablas por sí solo no implementa permisos ni flujos transaccionales de la aplicación.

## BIT-0002 — Especificaciones, backlog y memoria permanente

**Fecha:** 2026-10-03, America/Mexico_City.

**Identificación del commit:** mensaje con prefijo `BIT-0002`; localizable con `git log --all --grep='BIT-0002'`.

**Objetivo:** convertir el prototipo en trabajo implementable y conservar la memoria en cada commit.

**Relación con backlog:** preparación de PHS-001–003; no se declaran terminadas porque siguen abiertas las decisiones requeridas.

### Trabajo realizado

- Se crearon especificaciones con alcance, roles, pantallas, datos, estados, 20 reglas funcionales y 10 requisitos no funcionales propuestos.
- Se elaboró un backlog con 45 elementos en 10 épicas: 42 para MVP y 3 posteriores, con 171 criterios de aceptación, prioridad, tamaño orientativo, dependencias y trazabilidad.
- Se documentaron seis entregas R0–R5, trabajo posterior y 18 escenarios de aceptación integral.
- Se separaron D01–D10 como decisiones pendientes, sin presentar los coeficientes o simplificaciones del prototipo como políticas aprobadas.
- Se identificaron brechas del esquema inicial: contacto por proyecto, fecha base frente a operativa, vínculo de tarea vencida, calendario, reenvíos y publicación oficial, entre otras. Su resolución corresponde a las historias y decisiones indicadas; no se modificó el SQL en esta etapa.
- Se añadió esta bitácora, su resumen para retomar y las instrucciones persistentes de `AGENTS.md` para actualizarla con cada commit y subirlo cuando exista un remoto autorizado.
- Se agregaron enlaces de navegación en el README. Este commit incluye los documentos de producto que estaban pendientes de confirmar desde la etapa anterior.

### Archivos y referencias

- [Especificación](producto/ESPECIFICACION.md).
- [Backlog](producto/BACKLOG.md).
- [Plan de entregas](producto/PLAN-ENTREGAS.md).
- [Decisiones](producto/DECISIONES.md).
- [Instrucciones del repositorio](../AGENTS.md), esta bitácora y [README](../README.md).

### Decisiones y validación

- Solicitud confirmada del usuario: mantener una bitácora completa y actualizarla junto con cada commit; subir los cambios para conservar memoria.
- Se verificaron IDs únicos, consistencia entre índice y detalle del backlog, enlaces locales, dependencias sin ciclos y ausencia de dependencias hacia entregas posteriores.
- Los tamaños y entregas son propuestas de planificación, sin fechas comprometidas. Los 18 escenarios describen pruebas futuras, no pruebas de una aplicación ya construida.
- Para este cambio documental se revisan los enlaces, el diff y la inclusión de la bitácora antes del commit. No requiere volver a ejecutar las pruebas PostgreSQL: el esquema y su código de pruebas no cambiaron.
- No hay remoto configurado al preparar la entrada. La URL fue solicitada al usuario; el commit puede conservarse localmente mientras se resuelve la subida.

### Pendientes y siguiente paso

1. Configurar el remoto que indique el usuario y subir `main` sin forzar historia.
2. Resolver las decisiones R0 y refinar las historias de la primera entrega antes de implementar políticas dependientes.
3. Al continuar, leer el estado actual y esta entrada; registrar el siguiente conjunto de cambios como BIT-0003.

## BIT-0003 — Repositorio privado en GitHub

**Fecha:** 2026-10-03, America/Mexico_City.

**Objetivo:** crear el repositorio privado solicitado por el usuario y publicar el historial local.

**Identificación del commit:** prefijo `BIT-0003`.

### Trabajo realizado y archivos

- El usuario indicó la cuenta `iztaneo` y solicitó crear el repositorio privado. Se eligió `PHS`, consistente con el nombre del proyecto local.
- Se comprobó la sesión autenticada de GitHub y que `iztaneo/PHS` no existía antes de la creación.
- Se creó [iztaneo/PHS](https://github.com/iztaneo/PHS) con visibilidad privada y se vinculó `origin` mediante `git@github.com:iztaneo/PHS.git`.
- Se actualizó esta bitácora y su resumen para retomar. Los commits anteriores conservan su historia.

### Decisiones, validación y límites

- GitHub confirmó `visibility: PRIVATE` y repositorio vacío antes de subir archivos.
- Se revisó la lista de archivos versionados; la entrega contiene prototipo, SQL, pruebas y documentación. No se incluyen archivos ignorados, bases temporales ni credenciales de autenticación.
- Este commit registra la creación y el destino autorizado. A continuación se sube `main` con su historial, sin force push, y se comprueba que el SHA remoto coincida con el local. La confirmación de transferencia queda en Git; no se crea otro commit solo para anotar el hash o el resultado del push.
- No hay cambios funcionales ni de esquema que requieran repetir pruebas de PostgreSQL.

### Pendientes y siguiente paso

Completar/verificar la transferencia de `main` y, si falla, conservar el commit local para reintentar. Después continuar el refinamiento R0 y las decisiones D01–D10. El siguiente conjunto de cambios se registrará como BIT-0004.

## BIT-0004 — Selección inicial del stack tecnológico

**Fecha:** 2026-10-03, America/Mexico_City.

**Objetivo:** definir una propuesta concreta de tecnologías para construir el MVP con base en el prototipo, arquitectura y backlog.

**Relación:** D06 y PHS-003; avance documental, sin declarar la historia ni la decisión completas.

**Identificación:** commit con prefijo `BIT-0004`.

### Trabajo realizado y decisiones

- Se revisaron la arquitectura, el esquema, las decisiones pendientes y los requisitos de aplicación; se consultó documentación oficial actual de las tecnologías.
- Se propuso TypeScript, React/Vite, NestJS, Node 24 LTS, PostgreSQL 17, Kysely/pg, dbmate, motor independiente, outbox PostgreSQL y worker, OIDC, pruebas automatizadas y contenedores.
- Se documentaron responsabilidades, estructura futura, manejo de sesiones/evidencias, migraciones y la semántica de trabajos al menos una vez con efectos idempotentes.
- Se registró ADR-001 con alternativas y motivos. PostgreSQL continúa siendo la única tecnología expresamente confirmada por el usuario; la propuesta restante no se presenta como preferencia ya aprobada del equipo.
- Se solicitó al usuario información sobre restricciones tecnológicas. Al preparar esta entrada no se recibió otra preferencia; identidad corporativa, infraestructura y volumen piloto siguen pendientes.

### Archivos

[STACK-TECNOLOGICO.md](STACK-TECNOLOGICO.md), [ADR-001](adr/001-stack-mvp.md), arquitectura, especificación, registro D06, referencia de avance en PHS-003, README y esta bitácora.

### Validación y límites

- Se contrastaron familias de runtime/frameworks con fuentes oficiales y se documentó el mínimo de Node para CLI Nest 12. PostgreSQL 17.9 fue la versión del ensayo anterior, no un parche de producción fijado.
- Se revisan enlaces, diff y conservación de IDs/criterios del backlog. No se instalaron dependencias ni se ejecutó una prueba de compatibilidad conjunta.
- No se modificaron el esquema SQL, las pruebas ni el prototipo. No se contrataron servicios ni se desplegó infraestructura.
- Este commit se sube a `origin/main` y se verifica la coincidencia de SHA con el remoto conforme a las instrucciones del repositorio.

### Pendientes y siguiente paso

Confirmar restricciones de equipo/infraestructura y proveedor de identidad; completar contratos OpenAPI y validar versiones exactas con un esqueleto mínimo antes de implementar PHS-004–008. D01–D10 siguen sin aprobación completa. Siguiente entrada: BIT-0005.

## BIT-0005 — Revisión del proyecto y decisiones de stack, identidad y aprobación

**Fecha:** 2026-10-03, America/Mexico_City.

**Objetivo:** revisar el estado del repositorio y registrar las decisiones que el usuario confirmó a partir de esa revisión.

**Relación:** D05, D06, PHS-003, PHS-004, PHS-005 y ADR-001. Ninguna historia se declara terminada.

**Identificación:** commit con prefijo `BIT-0005`.

### Decisiones confirmadas por el usuario

- Se usará TypeScript/React/NestJS. Una sola persona desarrolla y aprueba.
- La identidad del MVP se valida en la base de datos; el usuario quiere primero un MVP funcional. OIDC queda pospuesto.
- La autoaprobación se permite dentro de la aplicación solo durante el piloto, auditada; se conserva el modelo de roles.

### Trabajo realizado y archivos

- Se registraron las decisiones en [DECISIONES.md](producto/DECISIONES.md) (sección nueva y filas D05/D06), [ADR-001](adr/001-stack-mvp.md) (estado y Revisión 1) y [STACK-TECNOLOGICO.md](STACK-TECNOLOGICO.md) (estado, fila de identidad, §6 y §9).
- Aclaraciones fechadas en [DATABASE-PHS.md](DATABASE-PHS.md) y [ESPECIFICACION.md](producto/ESPECIFICACION.md) sobre identidad y autoaprobación. Se actualizó el estado para retomar de esta bitácora.
- No se modificaron el SQL, las pruebas, el backlog ni el prototipo.

### Validación de la revisión

- En una instancia temporal de PostgreSQL 17.9, ya eliminada, la migración aplicó sobre una base vacía y creó 28 tablas; `001_integrity.sql` pasó con sus 11 rechazos.
- Se contaron 45 historias y 171 criterios en el backlog; `main` coincidía con `origin/main` en `7ccc4cd` antes de este commit.
- Con 20 inserciones adicionales de prueba (no versionadas), el esquema rechazó una baseline originada en una decisión rechazada y un salto de versión 2 → 4; ninguno está cubierto por `001_integrity.sql`.
- Límites: el prototipo no se ejecutó en navegador; el backlog y los tres HTML no se leyeron completos.

### Hallazgos sin corregir (para PHS-004)

1. Varias columnas de texto aceptan cadena vacía (nombre de proyecto, hito, práctica y cliente, correo, `resolution_note`), mientras otras lo impiden.
2. `review_cycle` acepta ciclos solapados del mismo proyecto.
3. Un hito sin actividad puede eliminarse con `DELETE`; riesgos, renovaciones y tareas tampoco tienen protección (estos últimos no se probaron).
4. Se aceptan fechas imposibles: hito completado en el futuro y `outbox_message.processed_at` anterior a su creación.
5. Claves foráneas sin índice, por ejemplo `evidence.milestone_id` y `health_task.event_id`.
6. `ARQUITECTURA-PHS.md` §5 lista entidades que el esquema resolvió con snapshots JSONB y `activity`; su §10 duplica la lista de decisiones.
7. `Project-Health-System-Prototype/app.py` escucha en `0.0.0.0`.

También se confirmó que la base permite hoy lo que la documentación ya asigna al backend: retroceder o anular el puntero de baseline, moneda de baseline distinta a la del proyecto, reenvío de revisión sin devolución previa y `TRUNCATE` de historial por el propietario.

### Pendientes y siguiente paso

Crear el esqueleto del monorepo y la prueba mínima de PHS-003; luego PHS-004 con la migración `002` (credencial local y hallazgos 1–5) y PHS-005. Siguen pendientes infraestructura, volumen piloto y D01–D04, D07–D10. Siguiente entrada: BIT-0006.

## BIT-0006 — Credencial local de usuarios en la base de datos

**Fecha:** 2026-10-03, America/Mexico_City.

**Objetivo:** a petición del usuario, preparar la base para guardar la identidad de los usuarios, conforme a la decisión D06 registrada en BIT-0005.

**Relación:** D06, PHS-004 y PHS-005; avance de esquema, sin declarar terminada ninguna historia. No hay backend que use la tabla.

**Identificación:** commit con prefijo `BIT-0006`.

### Trabajo realizado y archivos

- [002_user_credentials.sql](../db/migrations/002_user_credentials.sql): correo obligatorio, sin espacios sobrantes y único sin distinguir mayúsculas; valores por defecto de emisor `local` y sujeto generado; tabla `user_credential` con hash Argon2id en formato PHC, cambio obligatorio inicial, contador de intentos, bloqueo temporal y último acceso.
- [002_credentials.sql](../db/tests/002_credentials.sql): recorrido válido y 8 rechazos (correo duplicado con otra capitalización, vacío y con espacios; contraseña en texto plano; hash bcrypt; segunda credencial; usuario inexistente; intentos negativos).
- [DATABASE-PHS.md](DATABASE-PHS.md) (sección de identidad local, diccionario, instalación y validación), [README](../README.md) y esta bitácora.
- La migración 001 no se modificó.

### Decisiones y supuestos

- Supuesto de diseño no confirmado por el usuario: el correo es el nombre de acceso y solo se admite Argon2id; cambiar de algoritmo requiere otra migración.
- Las sesiones quedan fuera: dependen del mecanismo que se elija en PHS-005.
- Corrige el hallazgo 1 de BIT-0005 solo para el correo; los demás hallazgos siguen pendientes.

### Validación y límites

- Instancia temporal de PostgreSQL 17.9, eliminada al terminar: 001 y 002 aplican sobre base vacía (29 tablas); pasan `001_integrity.sql` (11 rechazos) y `002_credentials.sql` (8 rechazos). Reaplicar 002 falla sin dejar cambios parciales.
- No se probó sobre una base con usuarios previos ni se verificó un hash generado por una biblioteca real; la prueba usa una cadena PHC con formato válido.

### Pendientes y siguiente paso

Esqueleto del monorepo y PHS-003; adaptación a dbmate en PHS-004; PHS-005 con alta de usuarios, verificación Argon2id, bloqueo por intentos, restablecimiento y sesiones. Siguiente entrada: BIT-0007.

## BIT-0007 — Tabla propia de sesiones

**Fecha:** 2026-10-03, America/Mexico_City.

**Objetivo:** guardar en la base las sesiones de los usuarios que inician sesión con credencial local.

**Relación:** D06, PHS-004 y PHS-005; avance de esquema sin backend que lo use. Ninguna historia se declara terminada.

**Identificación:** commit con prefijo `BIT-0007`.

### Decisión confirmada

El usuario eligió una tabla de sesiones propia frente a la tabla de una biblioteca de sesiones o tokens firmados sin estado. Motivos expuestos: migraciones SQL como única fuente del esquema, revocación inmediata y vínculo por clave foránea con `app_user`.

### Trabajo realizado y archivos

- [003_user_session.sql](../db/migrations/003_user_session.sql): `user_session` con hash SHA-256 del token, límite absoluto, último uso, revocación con motivo, IP y agente opcionales e índices por usuario activo y por expiración.
- [003_sessions.sql](../db/tests/003_sessions.sql): ciclo crear → usar → cerrar → revocar todas → borrar, y 7 rechazos (token sin hash, hash duplicado, expiración pasada, usuario inexistente, revocación sin motivo, motivo desconocido y revocación anterior a la creación).
- [DATABASE-PHS.md](DATABASE-PHS.md), [STACK-TECNOLOGICO.md](STACK-TECNOLOGICO.md) (nota fechada en §6), [README](../README.md) y esta bitácora. Aclaración: la migración `003` que BIT-0006 reservaba para los hallazgos de BIT-0005 pasa a ser la `004`.
- No se modificaron las migraciones 001 ni 002.

### Supuestos, validación y límites

- Supuestos de diseño no confirmados: SHA-256 del token, cuatro motivos de revocación y registro opcional de IP/agente, cuya retención queda para D07.
- Instancia temporal de PostgreSQL 17.9, eliminada al terminar: 001–003 aplican sobre base vacía (30 tablas); pasan los tres archivos de pruebas con 11, 8 y 7 rechazos.
- La base no comprueba que el usuario siga activo ni la inactividad; lo hará el backend. No se probaron concurrencia ni volumen.

### Pendientes y siguiente paso

Esqueleto del monorepo y PHS-003; PHS-004 (dbmate y migración `004`); PHS-005 con alta de usuarios, verificación Argon2id, emisión y rotación del token, cookie `HttpOnly`, revocación y limpieza de sesiones vencidas. Siguiente entrada: BIT-0008.

## BIT-0008 — Arquitectura de microservicios y mapa de trazabilidad

**Fecha:** 2026-10-03, America/Mexico_City.

**Objetivo:** cruzar arquitectura, base de datos y backlog para mapear pantallas, servicios y requerimientos, y registrar el cambio de arquitectura pedido por el usuario.

**Relación:** D06, PHS-003, PHS-004, PHS-005, PHS-007, ADR-001 y ADR-002. Ninguna historia se declara terminada; no hay código de servicios.

**Identificación:** commit con prefijo `BIT-0008`.

### Decisiones confirmadas por el usuario

- La arquitectura no será monolítica: microservicios.
- Entre las alternativas presentadas eligió: cuatro servicios más gateway; base compartida con el esquema actual; REST más eventos por outbox en PostgreSQL.
- Aprobó guardar el mapa de trazabilidad y actualizar PHS-005 y PHS-007 con la identidad local.

### Trabajo realizado y archivos

- [ADR-002](adr/002-microservicios.md): servicios, propiedad de tablas, tablas compartidas de solo inserción, comunicación, alternativas y consecuencias.
- [MAPA-TRAZABILIDAD.md](MAPA-TRAZABILIDAD.md): pantalla → servicio → tablas → historias → reglas, capacidades sin pantalla, tablas por servicio y brechas.
- [ARQUITECTURA-PHS.md](ARQUITECTURA-PHS.md): §4 reescrita con el diagrama y la tabla de servicios; aclaración de entidades que no son tablas; notas en las operaciones críticas; contratos conceptuales añadidos para sesión, administración, ciclo, eventos y alertas.
- [STACK-TECNOLOGICO.md](STACK-TECNOLOGICO.md) (estructura de `apps/`, paquete `service-kit`, reparto del worker), [ADR-001](adr/001-stack-mvp.md) (Revisión 2), [DATABASE-PHS.md](DATABASE-PHS.md) (propiedad de tablas), [DECISIONES.md](producto/DECISIONES.md), [ESPECIFICACION.md](producto/ESPECIFICACION.md) y [README](../README.md).
- [BACKLOG.md](producto/BACKLOG.md): PHS-003 (avance y criterio 3), PHS-004 (30 tablas y roles), PHS-005 (criterio 3 reformulado y criterios 5–7 nuevos), PHS-007 (criterio 1 reformulado y criterio 5 nuevo). El total pasa de 171 a 175 criterios; IDs, dependencias y entregas no cambian.
- No se modificaron migraciones, pruebas SQL ni prototipo.

### Supuestos propuestos, no confirmados

Reparto exacto de tablas por servicio, consultas de gobierno dentro de Salud, tablas compartidas de solo inserción, identidad firmada por el gateway, un rol de PostgreSQL por servicio y el protocolo de envío de revisión.

### Validación y límites

- Se comprobó que las 30 tablas quedan asignadas una sola vez (5 + 11 + 9 + 2 + 3 compartidas) y que el backlog tiene 45 historias y 175 criterios numerados.
- El cruce usó la tabla de pantallas de la especificación, la línea "Datos / artefactos" de cada historia y el SQL; no se revisaron uno por uno todos los criterios.
- Nada de la arquitectura está probado en ejecución. Límites aceptados: los servicios quedan acoplados por el esquema compartido; enviar una revisión deja de ser una transacción única; hay más procesos que operar con un equipo de una persona.

### Pendientes y siguiente paso

Validar en el esqueleto (PHS-003) la identidad entre servicios y el protocolo Salud → Proyectos; definir roles de base por servicio en PHS-004; OpenAPI por servicio. Empezar por gateway + Identidad con inicio de sesión. Siguiente entrada: BIT-0009.

## BIT-0009 — Esqueleto del monorepo: web, gateway, Identidad y Proyectos

**Fecha:** 2026-10-03, America/Mexico_City.

**Objetivo:** crear la base ejecutable de la arquitectura de ADR-002 con las piezas que necesita la primera entrega (R1).

**Relación:** PHS-003 y D06; avance, la historia no se declara terminada. Sin funcionalidad de negocio.

**Identificación:** commit con prefijo `BIT-0009`.

### Trabajo realizado y archivos

- Raíz: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `.node-version`, `.env.example`, `docker-compose.yml` (PostgreSQL 17 local, puerto solo en 127.0.0.1) y `.gitignore` (`dist/`).
- `packages/service-kit`: carga de `.env`, validación de variables, pool de PostgreSQL, comprobación de base y formato de estado.
- `apps/identity` y `apps/projects`: servicios NestJS que escuchan en 127.0.0.1 y exponen `GET /health` con el estado de su conexión a la base.
- `apps/gateway`: NestJS; `GET /health`, `GET /api/v1/status` (estado agregado de los servicios) y proxy de `/api/v1/identity/*` y `/api/v1/projects/*` hacia cada servicio.
- `apps/web`: React + Vite; página que muestra el estado consultando al gateway mediante el proxy de desarrollo.
- [README](../README.md) (cómo arrancarlo), [STACK-TECNOLOGICO.md](STACK-TECNOLOGICO.md) (estado del esqueleto, versiones y diferencias), [BACKLOG.md](producto/BACKLOG.md) (avance de PHS-003) y esta bitácora.
- No se modificaron migraciones, pruebas SQL ni prototipo.

### Decisiones y supuestos

Tomadas al implementar, no confirmadas por el usuario: TypeScript 6.0.3; compilar con `tsc` sin el CLI de Nest; `@Inject` explícito; `service-kit` como paquete común; puertos 3000–3002 y 5173; prefijos `/api/v1/identity` y `/api/v1/projects`; servicios internos ligados a 127.0.0.1. Detalle en el documento de stack.

### Validación y límites

- `build`, `typecheck` y `test` pasan en los cinco paquetes: 9 pruebas (3 de `service-kit`, 2 por servicio y 2 del gateway).
- Ejecución real contra un PostgreSQL 17.9 temporal con las tres migraciones, eliminado al terminar: estado `ok` de ambos servicios, proxy del gateway hacia cada `/health`, 404 en ruta desconocida y la misma respuesta a través del proxy de Vite.
- Defecto encontrado y corregido durante la prueba: al caer la base, los servicios terminaban por un error no manejado del pool. Ahora siguen activos, informan `degraded` y vuelven a `ok` al recuperarse la base; se comprobó deteniendo y arrancando PostgreSQL.
- No probado: `docker-compose.yml` (Docker no estaba activo), el modo `dev` con recarga, la página en un navegador (solo se verificó que Vite sirve el HTML y el proxy) y el caso de un único servicio caído en ejecución real (cubierto por prueba unitaria).
- Límites: no hay autenticación ni identidad propagada, de modo que el gateway reenvía cualquier petición; no hay CI; `corepack` no inicia pnpm 12 en esta máquina y se usa `npx`.

### Pendientes y siguiente paso

PHS-004: dbmate, migración `004` con los hallazgos de BIT-0005 y roles de base por servicio. Después PHS-005: inicio de sesión en Identidad, sesión validada en el gateway e identidad firmada hacia los servicios. Siguiente entrada: BIT-0010.

## BIT-0010 — dbmate, endurecimiento, roles por servicio y base local sin Docker

**Fecha:** 2026-10-03, America/Mexico_City.

**Objetivo:** avanzar PHS-004 y dejar todo ejecutable en local sin Docker, como pidió el usuario.

**Relación:** PHS-004, ADR-002, hallazgos de BIT-0005. La historia no se declara terminada.

**Identificación:** commit con prefijo `BIT-0010`.

### Trabajo realizado y archivos

- Migraciones 001–003 adaptadas a dbmate: marcadores `migrate:up`/`migrate:down`, sin `BEGIN/COMMIT` propios, `SET LOCAL search_path` y `RESET` final. Su DDL no cambió. Aclaración: ya no se aplican con `psql -f` como indicaban BIT-0001, BIT-0006 y BIT-0007.
- [004_integrity_hardening.sql](../db/migrations/004_integrity_hardening.sql): textos obligatorios no vacíos, sin `DELETE` en proyecto, hito, riesgo, renovación, evento y tarea, y fecha de procesamiento del outbox.
- [005_service_roles.sql](../db/migrations/005_service_roles.sql): roles `phs_identity`, `phs_projects`, `phs_health` y `phs_platform` con sus permisos.
- Pruebas [004_hardening.sql](../db/tests/004_hardening.sql) y [005_roles.sql](../db/tests/005_roles.sql).
- [scripts/local-db.sh](../scripts/local-db.sh) y [db/local/dev_logins.sql](../db/local/dev_logins.sql); scripts `db:*` y dependencia `dbmate` en `package.json` y `pnpm-lock.yaml`; `.env.example`, `docker-compose.yml` y `.gitignore` (`.local/`).
- `apps/identity` y `apps/projects` usan `IDENTITY_DATABASE_URL` y `PROJECTS_DATABASE_URL`.
- [DATABASE-PHS.md](DATABASE-PHS.md), [DECISIONES.md](producto/DECISIONES.md) (clasificación de brechas), [BACKLOG.md](producto/BACKLOG.md) (avance de PHS-004), [STACK-TECNOLOGICO.md](STACK-TECNOLOGICO.md), [README](../README.md) y esta bitácora.

### Decisiones y supuestos

Tomados al implementar, no confirmados por el usuario: no permitir borrado físico de filas operativas; reparto exacto de permisos; solo Identidad lee credenciales y sesiones; propietario local `phs_owner`; migraciones sin reversión. No se añadió la restricción de ciclos solapados (depende de D03), ni índices de claves foráneas, ni un CHECK de fecha de cumplimiento futura.

### Validación y límites

- Instancia local del proyecto, PostgreSQL 17.9, sin Docker: dbmate aplica 001–005 sobre base vacía (30 tablas); repetir `db:migrate` no aplica nada; pasan las cinco pruebas SQL (11, 8, 7 y 14 rechazos, y 12 denegaciones de permiso).
- `build`, `typecheck` y las 9 pruebas de código pasan. Gateway, Identidad y Proyectos arrancaron con `.env` y sus usuarios restringidos y respondieron `ok`.
- Defecto encontrado y corregido: con un propietario llamado `phs`, PostgreSQL usaba el esquema `phs` como predeterminado y dbmate no encontraba su tabla de control. Se renombró el propietario local y cada migración restablece `search_path`.
- No probado: `docker-compose.yml`, actualización desde una base previa a dbmate (no existe ninguna), concurrencia. El PostgreSQL que ya corría en el puerto 5432 de la máquina no se tocó.
- Se creó `.env` local a partir de `.env.example`; está ignorado por Git.

### Pendientes y siguiente paso

De PHS-004: procedimiento de actualización y recuperación, contrato de JSONB y brechas dependientes de D02–D04 y D08. Siguiente: PHS-005. Siguiente entrada: BIT-0011.

## BIT-0011 — Inicio de sesión e identidad entre servicios

**Fecha:** 2026-10-03, America/Mexico_City.

**Objetivo:** implementar PHS-005 sobre la arquitectura de ADR-002 y validar la identidad propagada del gateway a los servicios.

**Relación:** PHS-005, PHS-003, D06, ADR-002. PHS-005 queda en revisión, no aceptada.

**Identificación:** commit con prefijo `BIT-0011`.

### Trabajo realizado y archivos

- `packages/service-kit`: token interno firmado con HMAC-SHA256 (`internal-auth.ts`) y sus pruebas.
- `apps/identity`: `AuthService` (inicio de sesión, validación, cierre y cambio de contraseña), hash Argon2id, controlador de sesiones protegido por firma interna, configuración por variables y comando `create-user`.
- `apps/gateway`: `/api/v1/session` (iniciar, consultar, cerrar, cambiar contraseña) con cookie `HttpOnly` y `SameSite=Strict`, comprobación de origen, identificador de petición, autenticación previa al proxy e identidad firmada. Identidad dejó de exponerse por proxy.
- `apps/projects`: guardia de firma interna y `GET /whoami` como comprobación temporal.
- `apps/web`: formularios de inicio de sesión y de cambio obligatorio de contraseña, página de inicio y cierre de sesión.
- `scripts/local-db.sh` (`test-db`, `seed`), `package.json`, `pnpm-lock.yaml`, `.env.example`.
- [ADR-002](adr/002-microservicios.md), [STACK-TECNOLOGICO.md](STACK-TECNOLOGICO.md), [BACKLOG.md](producto/BACKLOG.md), [README](../README.md) y esta bitácora.
- No se modificaron migraciones ni pruebas SQL.

### Decisiones y supuestos

Tomados al implementar, no confirmados por el usuario: contraseña de 12 a 128 caracteres; bloqueo de 15 minutos tras 5 intentos fallidos; sesión de 12 horas con 60 minutos de inactividad; respuesta idéntica para usuario inexistente, contraseña incorrecta y cuenta bloqueada; consultas con `pg` en lugar de Kysely; usuario inicial de desarrollo por comando, hasta que exista PHS-007.

### Validación y límites

- 20 pruebas de código pasan: 5 de `service-kit`, 4 del gateway, 2 de Proyectos y 9 de Identidad, 7 de ellas de integración contra la base local `phs_test`. `typecheck` sin errores y las cinco pruebas SQL pasan.
- Recorrido por el gateway con los servicios en ejecución: sin sesión responde 401; Identidad no es accesible por proxy; llamadas directas a los servicios sin firma o con firma falsa responden 401; origen ajeno responde 403; contraseña incorrecta 401; inicio correcto entrega cookie `HttpOnly` y el token no aparece en la respuesta; con contraseña temporal Proyectos responde 403 hasta cambiarla; contraseña débil 400; tras el cambio Proyectos recibe el usuario correcto aunque el cliente envíe una cabecera de identidad falsa; tras cerrar sesión responde 401. La auditoría registró los cuatro eventos sin secretos.
- En navegador, con un usuario de prueba: error de contraseña incorrecta, cambio obligatorio, página de inicio, sesión conservada al recargar y cierre de sesión.
- Defecto encontrado y corregido: un valor con espacios sin comillas en `.env` rompía `scripts/local-db.sh`.
- No probado: caducidad real de 12 horas (solo la de inactividad, manipulando fechas en la prueba), concurrencia de intentos, carga, `docker-compose.yml`. No hay límite de frecuencia por IP ni restablecimiento de contraseña por un administrador (PHS-007). Cada servicio arranca dos veces al iniciar `dev`; es inofensivo y queda pendiente.
- La base local se recreó al terminar; contiene solo el usuario de desarrollo con su contraseña temporal.

### Pendientes y siguiente paso

Aceptación de PHS-005 por el usuario. Siguiente: PHS-006 y PHS-007; D05 debe definir alcance por rol antes de aceptar permisos. Siguiente entrada: BIT-0012.

## Plantilla para próximas entradas

```text
## BIT-NNNN — Título concreto
Fecha y zona:
Objetivo:
Historias / decisiones relacionadas:
Trabajo realizado:
Archivos relevantes:
Decisiones confirmadas y supuestos:
Validación realizada y resultados:
Limitaciones / pendientes:
Siguiente paso:
Identificación: commit con prefijo BIT-NNNN.
```
