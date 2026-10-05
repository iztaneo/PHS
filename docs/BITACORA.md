# Bitácora del proyecto PHS

Memoria compartida de lo realizado, las decisiones, la validación y el trabajo pendiente. Este archivo se actualiza en el mismo commit que cada cambio, conforme a [AGENTS.md](../AGENTS.md).

## Estado actual para retomar

- **Producto:** Project Health System, para gobernar la salud de proyectos y servicios mediante PHF.
- **Disponible:** prototipo HTML, diagnóstico, arquitectura propuesta, diseño PostgreSQL, migraciones 001–007 aplicadas con dbmate, 001–015 (38 tablas), pruebas de integridad, especificación funcional, backlog y plan de entregas.
- **Aplicación ejecutable:** monorepo pnpm con `apps/web`, `apps/gateway`, los cuatro servicios (`identity`, `projects`, `health`, `platform`) y los paquetes `service-kit`, `contracts` y `health-engine`; ver README para arrancarlo.
- **Interfaz:** dirección visual clara, limpia y ejecutiva, responsiva y con menú lateral, decidida por el usuario; sistema de diseño en [DISENO-UI.md](producto/DISENO-UI.md) (BIT-0017).
- **Contratos de API:** OpenAPI 3.1 por servicio en [docs/api](api/README.md), generados desde `packages/contracts` y verificados por pruebas; Swagger UI local en `/api/docs/`.
- **Implementado (en revisión, sin aceptar):** todo R1 (acceso, permisos, administración, proyectos, equipo, hitos, línea base) y todo R2 (economía, riesgos, evidencias, cambios aprobados, renovaciones, estado del proyecto con la regla D08, motor completo y evaluación con score). Detalle por historia en el backlog.
- **R3 construido (en revisión, sin aceptar):** alertas, acciones y causa y plan (BIT-0024); ciclo de revisión, Health Review, validación y festivos (BIT-0025); confianza explicada, tendencia, proyección y proceso programado (BIT-0026). Lo que falta de cada historia está en su estado en el backlog.
- **Todavía no implementado:** todo R4 (alertas y notificaciones, despacho del outbox, Health Center, portafolio, timeline e historial, modelo PHF, consulta de pausados y cerrados) y R5 (piloto).
- **Decisiones confirmadas:** PostgreSQL como base del MVP; stack TypeScript/React/NestJS; identidad del MVP validada en la base de datos (OIDC pospuesto); autoaprobación permitida y auditada durante el piloto. El equipo es una sola persona que desarrolla y aprueba.
- **Stack:** TypeScript, React/Vite, NestJS en cada servicio, PostgreSQL 17, Kysely/pg, migraciones SQL/dbmate y Docker. Ver [stack](STACK-TECNOLOGICO.md) y [ADR-001](adr/001-stack-mvp.md); no está instalado y faltan infraestructura, volumen piloto y versiones exactas.
- **Supuesto no confirmado:** una empresa con varias prácticas. No se ha aprobado alcance SaaS multiempresa.
- **Backlog:** 46 elementos, 43 para el MVP y 3 posteriores (PHS-046, consulta de proyectos pausados y cerrados, añadida en BIT-0025). Ninguna historia se considera implementada por la existencia de estos documentos.
- **Decisiones abiertas:** D07 y D10 completas. D03 y D04 definidas por el usuario el 2026-10-04 (BIT-0023). D02 y D08 indicadas por el usuario con una interpretación de implementación pendiente de que la confirme. D09 confirmada, incluidas sus consecuencias de diseño, salvo expiración y restricción adicional de acceso; D06 parcialmente confirmada; de D05 solo quedan la separación de funciones tras el piloto y los responsables externos. D01 confirmada como reglas versión 1 ([REGLAS-PHF-v1.md](producto/REGLAS-PHF-v1.md)); faltan el peso del hito y la calibración. Ver [DECISIONES.md](producto/DECISIONES.md).
- **Hallazgos de BIT-0005:** textos vacíos, borrado físico y fecha de outbox corregidos en la migración 004; el resto clasificado en [DECISIONES.md](producto/DECISIONES.md).
- **Repositorio:** local en `/Users/indra/Documents/ChatGPT/PHS`, rama `main`; remoto `origin` en [iztaneo/PHS](https://github.com/iztaneo/PHS), creado y verificado como privado. La publicación y sincronización de commits se comprueban con Git (`git status -sb`, `git ls-remote origin refs/heads/main`).
- **Puntos abiertos de la arquitectura:** protocolo de envío de revisión entre Salud y Proyectos; rotación del secreto interno y aislamiento de red entre servicios.
- **Datos de demostración:** `seed:demo` carga seis usuarios y cinco proyectos (DEMO-001 a DEMO-005); regla del usuario en [AGENTS.md](../AGENTS.md): todo cambio funcional amplía el seed y se entrega con datos cargados (BIT-0021).
- **Entorno local sin Docker:** `db:setup` crea un PostgreSQL propio en `.local/pg` (puerto 54329), aplica migraciones y crea usuarios de desarrollo; ver README.
- **Siguiente paso funcional:** prueba y aceptación del usuario de R1 a R3; después R4, empezando por alertas y notificaciones (PHS-034) y el Health Center del PM (PHS-035). Por confirmar: las interpretaciones marcadas en la tabla de BIT-0025 de DECISIONES, D08 y los supuestos de BIT-0024. Abiertas: D07 y D10 (D10 se necesita para el portafolio).

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

## BIT-0012 — Perfiles y alcance de acceso (D05)

**Fecha:** 2026-10-03, America/Mexico_City.

**Objetivo:** describir los perfiles de la demo y terminar de definirlos con el usuario antes de implementar permisos.

**Relación:** D05, PHS-006, PHS-007. Solo documentación; no hay cambios de código ni de esquema.

**Identificación:** commit con prefijo `BIT-0012`.

### Hechos comprobados en la demo

Tres perfiles (PM, Líder, Dirección) con un selector que solo cambia el contenido del Health Center; todos los menús, acciones y proyectos quedan disponibles para cualquiera; no existe administrador; los responsables nombrados en un proyecto son texto sin permisos.

### Decisiones confirmadas por el usuario

PM ve solo sus proyectos; Dirección solo consulta; los datos económicos los ven PM, líder y Dirección; el administrador no accede a datos de negocio por serlo. Confirmó además, como decisiones de diseño de la pantalla de administración: roles acumulables, el responsable de un elemento puede actualizarlo, y responsable técnico y sponsor solo consultan.

### Archivos

[DECISIONES.md](producto/DECISIONES.md) (tabla de perfiles y fila D05), [ESPECIFICACION.md](producto/ESPECIFICACION.md) §3 y esta bitácora.

### Validación y límites

Revisión estática del prototipo (`ROLES`, `centerPM`, `centerLead`, `centerDir` y definiciones de vistas en `phf.html`). Ningún permiso está implementado todavía: hoy cualquier usuario autenticado pasa por el gateway.

### Pendientes y siguiente paso

Implementar PHS-006 y PHS-007 con estos perfiles. Siguiente entrada: BIT-0013.

## BIT-0013 — Permisos por alcance y administración de usuarios

**Fecha:** 2026-10-03, America/Mexico_City.

**Objetivo:** implementar PHS-006 y PHS-007 con los perfiles confirmados en BIT-0012.

**Relación:** PHS-006, PHS-007, D05, ADR-002. Ambas historias quedan en revisión, no aceptadas.

**Identificación:** commit con prefijo `BIT-0013`.

### Trabajo realizado y archivos

- [006_global_admin.sql](../db/migrations/006_global_admin.sql) y [006_admin.sql](../db/tests/006_admin.sql): `app_user.is_admin`; roles de práctica `pm`, `lead`, `director`.
- `packages/service-kit`: `access.ts` con las reglas de D05 como funciones puras y sus pruebas; `withTransaction`, `insertAudit` y `loadAccess`.
- `apps/identity`: `AdminService`, `AdminController` y `AdminGuard` (usuarios, credencial temporal, restablecimiento, habilitar/deshabilitar, administrador, prácticas y roles); la sesión informa administrador y roles; `create-user` puede crear o promover un administrador.
- `apps/projects`: `GET /projects` y `GET /projects/:id` filtrados por alcance con capacidades por proyecto; catálogo de tipos de servicio (lectura para todos, cambios solo administrador). Se retiró `GET /whoami`.
- `apps/gateway`: rutas `/api/v1/admin`, `/api/v1/projects` y `/api/v1/catalog`.
- `apps/web`: pestaña Administración (solo administradores) e inicio con roles y proyectos a su alcance.
- `.env.example`, `scripts/local-db.sh`, [DATABASE-PHS.md](DATABASE-PHS.md), [BACKLOG.md](producto/BACKLOG.md), [MAPA-TRAZABILIDAD.md](MAPA-TRAZABILIDAD.md), [STACK-TECNOLOGICO.md](STACK-TECNOLOGICO.md), [README](../README.md) y esta bitácora.

### Decisiones y supuestos

- Confirmado por el usuario (BIT-0012): perfiles, roles acumulables, responsable de elemento, responsable técnico y sponsor.
- Tomado al implementar, no confirmado: el administrador es una marca global del usuario y no un rol de práctica; siempre debe quedar un administrador activo; un proyecto ajeno responde 404 igual que uno inexistente; el nombrado como líder del proyecto consulta, pero aprobar exige el rol de líder en la práctica; la contraseña temporal la genera el servidor y se muestra una sola vez; un administrador no puede restablecer su propia contraseña desde la pantalla.

### Validación y límites

- 36 pruebas de código pasan: 11 de `service-kit`, 4 del gateway, 7 de Proyectos y 14 de Identidad; 17 son de integración contra `phs_test`. `typecheck` sin errores y las seis pruebas SQL pasan.
- Prueba de alcance con el rol restringido de Proyectos: un PM solo ve su proyecto y no el de otro PM de la misma práctica; líder y Dirección ven su práctica y nada de otra; miembro, sponsor y responsable de un riesgo consultan sin datos económicos; administrador y usuario deshabilitado no ven nada.
- Recorrido por el gateway con dos usuarios de prueba: administración bloqueada hasta cambiar la contraseña temporal; alta de práctica, usuario y roles; duplicados 409; rol inválido 400; un no administrador recibe 403 en administración y en cambios de catálogo; restablecer y deshabilitar terminan la sesión del usuario; la auditoría registró cada operación sin contraseñas ni hashes.
- En navegador: pestaña Administración, tabla de usuarios, asignación de un rol y su aparición en el inicio.
- Límites: aún no hay comandos de negocio que proteger; los datos económicos no se exponen todavía; los permisos por elemento (hito, riesgo, acción) se aplicarán con sus historias; no hay paginación ni búsqueda en la lista de usuarios; no se probó concurrencia real de dos administradores, solo el bloqueo previsto.
- La base local se recreó al terminar: contiene solo el usuario de desarrollo, ahora administrador, con su contraseña temporal.

### Pendientes y siguiente paso

Aceptación de PHS-005, 006 y 007 por el usuario. Siguiente: PHS-008 y PHS-009. Siguiente entrada: BIT-0014.

## BIT-0014 — Contratos OpenAPI por servicio

**Fecha:** 2026-10-03, America/Mexico_City.

**Objetivo:** definir y publicar los contratos de las APIs ya construidas, que el usuario pidió antes de continuar.

**Relación:** PHS-003 (criterio 2), ADR-002, STACK-TECNOLOGICO §7. La historia sigue abierta.

**Identificación:** commit con prefijo `BIT-0014`.

### Trabajo realizado y archivos

- `packages/contracts` (nuevo): esquemas Zod de entrada y salida, tabla de rutas de Identidad, Proyectos y gateway, generador de OpenAPI 3.1 y comando `api:docs`.
- [docs/api](api/README.md): `gateway.openapi.json` (público, 12 rutas), `identity.openapi.json` (interno, 10) y `projects.openapi.json` (interno, 5), más su guía.
- `apps/identity`, `apps/projects` y `apps/gateway`: los controladores validan con los esquemas del paquete; `GET /openapi.json` en cada servicio y Swagger UI en `/api/docs/` del gateway, solo con `API_DOCS=true`.
- Pruebas nuevas: coincidencia entre archivos y contratos, rutas registradas frente a rutas declaradas en cada servicio, y respuestas reales validadas contra los esquemas.
- `.env.example`, `package.json`, `pnpm-lock.yaml`, [README](../README.md), [STACK-TECNOLOGICO.md](STACK-TECNOLOGICO.md), [ARQUITECTURA-PHS.md](ARQUITECTURA-PHS.md), [MAPA-TRAZABILIDAD.md](MAPA-TRAZABILIDAD.md), [BACKLOG.md](producto/BACKLOG.md) y esta bitácora.

### Decisiones y supuestos

Tomados al implementar, no confirmados por el usuario: generar OpenAPI desde Zod en lugar de `@nestjs/swagger`; el contrato público compone las rutas propias del gateway con las que reenvía; la documentación se sirve solo con `API_DOCS=true`. Corrección detectada al escribir el contrato: cerrar sesión responde 204 aunque no haya sesión, así que se declara sin autenticación obligatoria.

### Validación y límites

- 46 pruebas de código pasan (7 de contratos, 11 de `service-kit`, 5 del gateway, 8 de Proyectos y 15 de Identidad); `typecheck` sin errores.
- Con los servicios en ejecución: Swagger UI responde por el gateway y por el proxy de la web, y los tres JSON se sirven con el número de rutas esperado; se revisó la página en el navegador.
- Límites: las respuestas se validan contra el contrato en las pruebas de integración de los servicios, no en cada respuesta en ejecución ni a través del gateway; los códigos de error están documentados pero no todos tienen una prueba que los provoque; paginación, filtros, concurrencia e idempotencia no están en el contrato porque ninguna ruta actual los usa; la web sigue declarando sus propios tipos en lugar de importarlos del paquete.

### Pendientes y siguiente paso

PHS-008 y PHS-009, añadiendo al contrato versión esperada, idempotencia, paginación y filtros. Siguiente entrada: BIT-0015.

## BIT-0015 — Auditoría, concurrencia, idempotencia y ficha de proyectos

**Fecha:** 2026-10-03, America/Mexico_City.

**Objetivo:** implementar PHS-008 y PHS-009.

**Relación:** PHS-008, PHS-009, PHS-003 (contrato), NF-05, RN-16, RN-19. Ambas historias quedan en revisión, no aceptadas.

**Identificación:** commit con prefijo `BIT-0015`.

### Trabajo realizado y archivos

- [007_command_idempotency.sql](../db/migrations/007_command_idempotency.sql) y [007_idempotency.sql](../db/tests/007_idempotency.sql).
- `packages/service-kit`: `runIdempotent`, `insertOutbox` y auditoría con proyecto asociado.
- `packages/contracts` y [docs/api](api/README.md): alta, ficha, edición, lista paginada con filtros, clientes y personas de una práctica; parámetros de consulta y cabeceras en el contrato; convenciones de paginación, concurrencia e idempotencia.
- `apps/projects`: `ProjectsService` y `ProjectsController` con `POST /projects`, `PATCH /projects/:id`, `GET /projects` (búsqueda, filtros, paginación), `GET /projects/:id`, `GET /clients` y `GET /people`.
- `apps/gateway`: rutas `/api/v1/clients` y `/api/v1/people`.
- `apps/web`: lista de proyectos con búsqueda, filtros y paginación; formulario de alta; ficha con edición, aviso de conflicto y aviso de línea base pendiente.
- [DATABASE-PHS.md](DATABASE-PHS.md), [MAPA-TRAZABILIDAD.md](MAPA-TRAZABILIDAD.md), [BACKLOG.md](producto/BACKLOG.md), [README](../README.md) y esta bitácora.

### Decisiones y supuestos

Tomados al implementar, no confirmados por el usuario: el PM debe tener rol de PM en la práctica y el líder rol de líder; un PM solo puede registrarse a sí mismo como PM y reasignar PM o líder exige el rol de líder; responsable técnico y sponsor solo deben ser usuarios activos; el cliente se captura por nombre y se reutiliza sin distinguir mayúsculas; el código lo captura el usuario; la zona horaria se hereda de la práctica y la moneda es MXN por defecto, ambas sin edición; las fechas dejan de ser editables cuando existe línea base; la clave de idempotencia es obligatoria al crear.

### Validación y límites

- 57 pruebas de código pasan (7 de contratos, 11 de `service-kit`, 5 del gateway, 19 de Proyectos y 15 de Identidad); `typecheck` sin errores; siete pruebas SQL pasan.
- Probado contra la base de pruebas con el rol restringido de Proyectos: alta con auditoría y outbox; doce rechazos con su código y sin restos; fallo provocado en la base que revierte proyecto, cliente y auditoría; reintento con la misma clave que devuelve el resultado original, incluso con dos peticiones simultáneas; dos editores con la misma revisión, un éxito y un conflicto; permisos de edición; fechas bloqueadas con línea base; búsqueda, filtros y paginación dentro del alcance.
- Por el gateway: alta, reintento, clave reutilizada, código duplicado, fechas inválidas, edición, conflicto de revisión, búsqueda y petición sin sesión.
- En navegador: lista, ficha, alta con error de fechas que conserva lo capturado y edición con otro editor simultáneo.
- Defectos encontrados y corregidos en la prueba de navegador: responsables duplicados en los selectores de la ficha; y tras un conflicto, reintentar enviaba todos los campos y habría pisado el cambio de la otra persona, ahora solo se envían los campos editados.
- Límites: PHS-008 criterio 3 sin comprobar para hijos del proyecto; ningún consumidor procesa todavía el outbox; `command_idempotency` no tiene limpieza; no hay prueba automática de las pantallas; la lista de personas de una práctica muestra a todos los usuarios activos.
- La base local se recreó al terminar: contiene solo el usuario de desarrollo administrador con su contraseña temporal.

### Pendientes y siguiente paso

Aceptación de PHS-005 a PHS-009 por el usuario. Siguiente: PHS-010, PHS-015 y PHS-011. Siguiente entrada: BIT-0016.

## BIT-0016 — Equipo, hitos y línea base inicial

**Fecha:** 2026-10-03, America/Mexico_City.

**Objetivo:** implementar PHS-010, PHS-015 y PHS-011 para completar el recorrido de la primera entrega (R1).

**Relación:** PHS-010, PHS-015, PHS-011, PHS-008 (criterio 3), D08, RN-02, RN-14, RN-17, RN-19. Las tres historias quedan en revisión, no aceptadas.

**Identificación:** commit con prefijo `BIT-0016`.

### Trabajo realizado y archivos

- [008_project_context_and_commitments.sql](../db/migrations/008_project_context_and_commitments.sql) y [008_context.sql](../db/tests/008_context.sql).
- `packages/contracts` y [docs/api](api/README.md): nueve rutas nuevas de equipo, hitos y línea base; contrato de los snapshots de la línea base.
- `apps/projects`: `TeamService`, `MilestonesService`, `BaselinesService` y `ProjectChildrenController`; contacto y escalación en la ficha; `lockProject` y `bumpProjectRevision` compartidos.
- `apps/web`: pestañas Ficha, Equipo, Hitos y Línea base en el proyecto.
- [DATABASE-PHS.md](DATABASE-PHS.md), [DECISIONES.md](producto/DECISIONES.md) (brechas), [BACKLOG.md](producto/BACKLOG.md), [README](../README.md) y esta bitácora.

### Decisiones y supuestos

Tomados al implementar, no confirmados por el usuario:

- Contacto y escalación son campos del proyecto; los del cliente quedan como datos generales.
- El hito tiene fecha operativa y fecha comprometida. Antes de la línea base la fecha se edita libremente; después, moverla es una reprogramación con motivo obligatorio que no cambia el compromiso.
- Transiciones del hito: pendiente → en curso o cumplido; en curso → cumplido; reprogramado → en curso o cumplido; cualquiera abierto → cancelado. Completar, cancelar y reabrir exigen comentario. Reabrir es provisional hasta D08.
- El responsable de un hito puede cambiar su estado aunque no sea PM ni integrante (decisión confirmada en BIT-0012); editar el hito o reprogramarlo corresponde a PM o líder.
- La línea base inicial toma fechas y moneda del proyecto, los hitos no cancelados y el equipo con sus responsables. La publica PM o líder. Los importes solo los ve quien puede ver datos económicos.
- Un hito agregado después de la línea base queda fuera de ella.

### Validación y límites

- 65 pruebas de código pasan (7 de contratos, 11 de `service-kit`, 5 del gateway, 27 de Proyectos y 15 de Identidad); `typecheck` sin errores; ocho pruebas SQL pasan.
- Probado contra la base de pruebas: integrante único y actualizable; aviso al quitar a quien tiene un hito abierto y conservación de su acceso de consulta; hito con línea de tiempo, auditoría, outbox y revisiones; vencido según la fecha en la zona del proyecto; transiciones permitidas y rechazadas; responsable que actualiza su hito; línea base única, completa e inmutable frente a cambios posteriores; presupuesto desconocido conservado como nulo; importes ocultos para un lector.
- Por el gateway y en navegador con usuarios de prueba: las tres pestañas, el aviso de responsabilidades, la línea base publicada y la reprogramación.
- Límites: sin imagen de evidencia al completar (PHS-017); no se editan desde la pantalla el título, el responsable ni el avance de un hito, aunque la API lo permite; no hay comparación entre versiones de línea base; el vencimiento se calcula al consultar, sin evento ni tarea (PHS-030/033); no se probó el cruce de medianoche entre zonas horarias; no hay pruebas automáticas de las pantallas.
- La base local se recreó al terminar: contiene solo el usuario de desarrollo administrador con su contraseña temporal.

### Pendientes y siguiente paso

Aceptación de R1 (PHS-004 a PHS-011 y PHS-015) por el usuario. Para R2 hace falta cerrar D01 (fórmulas del motor). Siguiente entrada: BIT-0017.

## BIT-0017 — Sistema de diseño y rediseño responsivo

**Fecha:** 2026-10-03, America/Mexico_City.

**Objetivo:** definir una interfaz más cuidada antes de continuar con la funcionalidad, a petición del usuario.

**Relación:** NF-06, PHS-041, STACK-TECNOLOGICO. No cambia API, base de datos ni reglas de negocio.

**Identificación:** commit con prefijo `BIT-0017`.

### Decisiones confirmadas por el usuario

Dirección A (clara y sobria, como el prototipo), muy limpia, muy ejecutiva y responsiva para teléfono; menú lateral; sistema de diseño más rediseño de las pantallas existentes.

### Trabajo realizado y archivos

- [DISENO-UI.md](producto/DISENO-UI.md): decisiones, principios, tokens, componentes y reglas de adaptación.
- `apps/web`: Tailwind CSS e iconos (`package.json`, `vite.config.ts`, `src/index.css`, `src/main.tsx`); componentes base en `src/ui.tsx`; `App.tsx` con menú lateral en escritorio y menú desplegable en teléfono; `Projects.tsx`, `ProjectSections.tsx` y `Admin.tsx` rediseñados. La lógica y las llamadas a la API no cambiaron.
- `pnpm-lock.yaml`, [STACK-TECNOLOGICO.md](STACK-TECNOLOGICO.md), [README](../README.md) y esta bitácora.

### Decisiones y supuestos

Tomados al implementar, no confirmados por el usuario: valores exactos de color y tipografía; componentes propios en lugar de shadcn/ui; administración separada en tres pestañas; usuarios e hitos como tarjetas; listas como tarjetas en teléfono y tabla en escritorio; el menú muestra solo las secciones que existen.

### Validación y límites

- `build`, `typecheck` y las 65 pruebas de código pasan; las pruebas no cubren la interfaz.
- Revisado en navegador con una pila de vista previa aparte, conectada a la base de pruebas para no tocar los datos del usuario: acceso, lista de proyectos, ficha, equipo, hitos, línea base y administración a 1280 px; las mismas pantallas a 375 px sin desborde horizontal; menú de teléfono que abre y cierra.
- Defecto encontrado y corregido: la barra de pestañas mostraba una barra de desplazamiento vertical.
- Límites: sin modo oscuro; contraste y lector de pantalla sin verificar con herramientas; no se probó en un teléfono real ni en Safari; las pantallas futuras aún no existen.
- La base local de desarrollo no se recreó: conserva la contraseña que el usuario ya cambió.

### Pendientes y siguiente paso

Validación visual por el usuario. Después, R2. Siguiente entrada: BIT-0018.

## BIT-0018 — Decisión D01: reglas del motor versión 1

**Fecha:** 2026-10-03, America/Mexico_City.

**Objetivo:** revisar con el usuario las reglas del motor de salud antes de construirlo.

**Relación:** D01, PHS-002, RN-02 a RN-10. Solo documentación; el motor no está construido.

**Identificación:** commit con prefijo `BIT-0018`.

### Hechos comprobados en el prototipo

Se leyeron `plannedProgress`, `actualProgress`, `projectDeviation`, `financialDeviation`, las seis funciones `dim*`, `gateStatus`, `assess`, `confidence`, `trend` y `forecast`. El avance cuenta hitos con 50% fijo para los que están en curso; la desviación financiera compara el costo con un gasto lineal por calendario; sin dimensiones evaluables el score es 70 y Gobernanza vale 40 sin ciclo configurado.

### Decisiones confirmadas por el usuario

1. Avance por peso de cada hito.
2. Desviación financiera contra el avance real.
3. Sin datos no hay score: "Sin evaluación"; una dimensión sin dato no entra al promedio y baja la confianza.
4. Pesos, topes, semáforo y demás coeficientes del prototipo adoptados como versión 1.

### Trabajo realizado y archivos

[REGLAS-PHF-v1.md](producto/REGLAS-PHF-v1.md) (nuevo: fórmulas, dimensiones, topes, redondeo, confianza, tendencia, pronóstico y 15 ejemplos), [DECISIONES.md](producto/DECISIONES.md), [ESPECIFICACION.md](producto/ESPECIFICACION.md), [BACKLOG.md](producto/BACKLOG.md) (PHS-002), [README](../README.md) y esta bitácora.

### Detalles propuestos y confirmados por el usuario

Avance comprometido calculado con los pesos de los hitos de la línea base cuya fecha ya pasó; hitos cancelados fuera del cálculo; logro de un hito en curso igual a su porcentaje reportado, 0 si no se reportó; sin línea base o sin hitos la desviación queda sin dato; cálculo con decimales exactos, umbrales antes de redondear y dos decimales guardados.

### Validación y límites

Los 15 ejemplos se calcularon a mano; no hay código que los ejecute. Ningún coeficiente está calibrado con proyectos reales. El peso de un hito no se captura todavía: todos valen 1.

### Pendientes y siguiente paso

Construir R2 empezando por economía y riesgos, que son entradas del motor. Siguiente entrada: BIT-0019.

## BIT-0019 — Economía, riesgos e inicio del motor

**Fecha:** trabajo realizado la noche del 2026-10-03 y cerrado el 2026-10-04, America/Mexico_City.

**Objetivo:** implementar PHS-012 y PHS-016, las entradas que el motor necesita, con las reglas versión 1.

**Relación:** PHS-012, PHS-016, PHS-025 (avance), D01, RN-02, RN-07, RN-12, RN-17, RN-19. Las historias quedan en revisión, no aceptadas.

**Identificación:** commit con prefijo `BIT-0019`.

### Trabajo realizado y archivos

- `packages/health-engine` (nuevo): avance por peso de hito y desviación financiera contra el avance real, con decimales exactos y umbrales estrictos; pruebas con los ejemplos 1 a 8 y 13 de [REGLAS-PHF-v1.md](producto/REGLAS-PHF-v1.md).
- `packages/contracts` y [docs/api](api/README.md): seis rutas nuevas de economía y riesgos.
- `apps/projects`: `FinanceService` (observaciones acumuladas, correcciones que conservan la anterior, consulta a una fecha y desviación calculada) y `RisksService` (alta, seguimiento con comentario y valores anteriores y nuevos, transiciones e historial).
- `apps/web`: pestañas Riesgos y Economía en el proyecto; Economía solo para quien puede ver importes.
- [BACKLOG.md](producto/BACKLOG.md), [STACK-TECNOLOGICO.md](STACK-TECNOLOGICO.md), [REGLAS-PHF-v1.md](producto/REGLAS-PHF-v1.md), [README](../README.md) y esta bitácora. Sin migraciones nuevas.

### Decisiones y supuestos

Tomados al implementar, no confirmados por el usuario: registrar economía exige poder editar el proyecto y ver importes (PM o líder); la fecha efectiva no puede ser futura; solo se puede corregir una observación que no haya sido corregida; categorías de riesgo del prototipo como catálogo fijo; transiciones de riesgo abierto → en mitigación → mitigado → cerrado, abierto o en mitigación → materializado → cerrado, y reapertura desde mitigado o cerrado; todo seguimiento exige comentario; el responsable del riesgo puede darle seguimiento pero no reasignarlo; el peso de cada hito se toma del snapshot de la línea base, hoy siempre 1.

### Validación y límites

- 85 pruebas de código pasan (11 del motor, 7 de contratos, 11 de `service-kit`, 5 del gateway, 36 de Proyectos y 15 de Identidad); `typecheck` sin errores. Las ocho pruebas SQL no cambiaron.
- Probado contra la base de pruebas: el ejemplo 5 de las reglas de punta a punta (presupuesto 100,000, avance 50%, costo 54,000 da 4% y activa el tope); observación aplicable a una fecha sin sumar acumulados; corrección que conserva la original; datos faltantes sin desviación inventada; economía prohibida para lector y responsable de hito; alta, seguimiento, transiciones e historial de riesgos; mitigación vencida.
- En la pila de vista previa, sin tocar los datos del usuario: pestañas Economía y Riesgos a 1280 px y 375 px, seguimiento de un riesgo e historial.
- Límites: el motor solo calcula avance y desviación financiera; no hay score ni dimensiones; el vencimiento de un riesgo se calcula al consultar, sin evento ni tarea; la pantalla de riesgos no permite cambiar probabilidad, impacto, fecha, estrategia ni responsable; no hay consulta de economía a una fecha pasada desde la pantalla.

### Pendientes y siguiente paso

El motor completo y la evaluación (PHS-025/026) requieren crear el servicio Salud. Evidencias (PHS-017) requiere el servicio Plataforma y D09. Siguiente entrada: BIT-0020.

## BIT-0020 — Decisión D09: evidencias

**Fecha:** 2026-10-04, America/Mexico_City.

**Objetivo:** definir con el usuario la política de evidencias antes de construir PHS-017.

**Relación:** D09, PHS-017, PHS-023, PHS-024, NF-10, RN-12. Solo documentación.

**Identificación:** commit con prefijo `BIT-0020`.

### Decisiones confirmadas por el usuario

Formatos: texto, imágenes, PDF y Office. Tamaño máximo de 10 MB por archivo. Evidencia posterior al cierre o la validación aceptada como adenda. Retiro con motivo por PM o líder, eliminando el archivo y conservando el registro.

### Trabajo realizado y archivos

[DECISIONES.md](producto/DECISIONES.md) (sección D09 y fila de la tabla) y esta bitácora.

### Supuestos propuestos

No objetados por el usuario: carpeta privada con adaptador, visibilidad igual a la del proyecto, carga por quien puede actualizar el elemento, validación del tipo real y conservación mientras exista el proyecto. Propuestos y sin confirmar: solo formatos actuales de Office y sin macros; entrega como descarga; tabla aparte para retiros y marca de adenda, con migración nueva.

### Validación y límites

Se contrastó con la tabla `evidence` de la migración inicial: es de solo inserción y no tiene dónde registrar un retiro ni una adenda. No hay código de evidencias todavía. El servicio Plataforma, dueño de esa tabla según ADR-002, no existe.

### Pendientes y siguiente paso

Construir PHS-017 con el servicio Plataforma. Siguen abiertas la expiración (D07) y la restricción adicional de acceso. Siguiente entrada: BIT-0021.

## BIT-0021 — Datos de demostración para probar cada cambio

**Fecha:** 2026-10-04, America/Mexico_City.

**Objetivo:** cumplir la regla pedida por el usuario: cada cambio debe poder probarse con datos ya cargados.

**Relación:** PHS-040 (fixtures), AGENTS.md. No cambia API, esquema ni reglas de negocio.

**Identificación:** commit con prefijo `BIT-0021`.

### Decisión confirmada por el usuario

Antes de continuar, y en cada cambio, debe haber datos de prueba cargados para recorrer el flujo.

### Trabajo realizado y archivos

- [AGENTS.md](../AGENTS.md): sección "Datos de prueba" con la regla y cómo cumplirla.
- `apps/identity/src/cli/seed-demo.ts`: dos prácticas, seis usuarios con sus roles y roles de negocio para el administrador de desarrollo.
- `apps/projects/src/cli/seed-demo.ts`: cuatro proyectos creados mediante los servicios, con equipo, hitos, línea base, cambios de estado, observaciones económicas y riesgos; fechas relativas al día en que se ejecuta.
- `scripts/local-db.sh` (`seed-demo`), `package.json` (`seed:demo`, y `db:setup` ahora incluye administrador y demostración), `.env.example` (`DEMO_USER_PASSWORD`), [README](../README.md) y esta bitácora.

### Decisiones y supuestos

Tomados al implementar, no confirmados por el usuario: nombres y cifras de los datos; contraseña común sin cambio obligatorio para los usuarios de demostración; el administrador de desarrollo recibe roles de PM y líder en Consultoría y de Dirección en Datos; el seed no modifica un proyecto que ya existe, así que los datos nuevos de una funcionalidad se añaden como proyectos o pasos nuevos.

### Validación y límites

- Ejecutado sobre la base local del usuario sin recrearla; una segunda ejecución no creó nada.
- Por el gateway, con cada usuario: Ana y Luis ven DEMO-001 a 003; Carla ve los cuatro; Pablo solo DEMO-004; Diego ve los tres donde participa; Elena solo DEMO-001 y recibe 403 en economía.
- DEMO-001 da avance 25%, desviación financiera 32.5% con tope activo y un hito crítico vencido; DEMO-002 da avance 66.67% y desviación −1.67%; DEMO-003 no tiene datos para la desviación.
- `build` y `typecheck` pasan; las pruebas automáticas no cambian y siguen usando la base `phs_test`.
- Límites: las fechas son relativas al día de carga, de modo que con el paso de los días los datos "próximos" terminan vencidos; para refrescarlos hay que recrear la base. Al archivo `.env` del usuario solo se le añadió `DEMO_USER_PASSWORD`.

### Pendientes y siguiente paso

Ampliar el seed con cada funcionalidad nueva. Siguiente entrada: BIT-0022.

## BIT-0022 — Segunda entrega: salud con score, cambios, evidencias, renovaciones y estado

**Fecha:** 2026-10-04, America/Mexico_City.

**Objetivo:** ejecutar, a petición del usuario, los cuatro bloques pendientes de R2 y registrar las decisiones D02, D03, D04 y D08 que indicó.

**Relación:** PHS-013, PHS-014, PHS-017, PHS-018, PHS-019, PHS-025, PHS-026; D01, D02, D03, D04, D08, D09; ADR-002. Las historias quedan en revisión, no aceptadas.

**Identificación:** commit con prefijo `BIT-0022`.

### Decisiones indicadas por el usuario

- D08: tras un mes pausado o cerrado, el sistema solicita el motivo, lo guarda y obliga al PM a describir la situación.
- D02: la revisión adquiere vigencia desde su alta; si el líder la devuelve hay una observación que atender.
- D03: ciclos semanales, parametrizables.
- D04: generan alerta atrasos, desviaciones, sobrecostos y todo lo que indique que un proyecto va mal.
- D09: después de revisar la explicación con lo ya implementado, confirmó las consecuencias propuestas (Office actual sin macros, tipo validado por contenido, descarga salvo imágenes, tabla de retiros y marca de adenda) y los supuestos de almacenamiento, visibilidad y carga.

La interpretación para implementar D02, D03, D04 y D08 está en [DECISIONES.md](producto/DECISIONES.md) y no ha sido confirmada. En este commit solo se implementó D08; D02, D03 y D04 quedan registradas para R3.

### Trabajo realizado y archivos

**Salud (PHS-025, PHS-026).** `packages/health-engine`: `assess` con las seis dimensiones, los seis topes, score, semáforo, confianza y la explicación de cada resta. `apps/health` (nuevo servicio): `AssessmentsService` lee las entradas en un solo corte, calcula, guarda en `health_assessment` con su `rule_set` y devuelve la evaluación; `ProjectsClient` pregunta al servicio Proyectos por el alcance. Pestaña Salud en la web.

**Cambios (PHS-018, PHS-019).** `apps/projects`: `ChangesService` con propuesta inmutable que guarda valores anteriores y propuestos, y decisión que al aprobar crea la línea base N+1 y mueve solo los hitos listados. Pestaña Cambios e historial de versiones en Línea base.

**Evidencias (PHS-017).** `apps/platform` (nuevo servicio): detección del tipo real por contenido, límite de 10 MB, almacenamiento local privado mediante adaptador, adendas, descarga con permiso verificado y retiro con motivo. Panel de evidencias en hitos y riesgos.

**Estado y renovaciones (PHS-013, PHS-014).** `apps/projects`: `StatusService` con transiciones con motivo, historial, elementos abiertos, regla D08 y renovaciones con resultado. Tarjetas de estado y renovaciones en la ficha, y aviso de justificación en todo el proyecto.

**Comunes.** Migraciones [009](../db/migrations/009_evidence_addendum_and_withdrawal.sql) y [010](../db/migrations/010_project_status_log_and_renewal_outcome.sql) con sus pruebas; contratos y [docs/api](api/README.md) con dos servicios más y 14 rutas nuevas; rutas del gateway; variables en `.env.example`; seed ampliado con cambios, evidencias, renovaciones, estados y el proyecto DEMO-005; [DATABASE-PHS.md](DATABASE-PHS.md), [ADR-002](adr/002-microservicios.md), [REGLAS-PHF-v1.md](producto/REGLAS-PHF-v1.md), [BACKLOG.md](producto/BACKLOG.md), [MAPA-TRAZABILIDAD.md](MAPA-TRAZABILIDAD.md), [STACK-TECNOLOGICO.md](STACK-TECNOLOGICO.md), [README](../README.md) y esta bitácora.

### Decisiones y supuestos

Tomados al implementar, no confirmados por el usuario:

- D08: plazo de 30 días; la justificación se pide una vez por periodo de pausa o cierre; mientras falta, nadie edita el proyecto ni cambia su estado, y leer nunca se bloquea; puede justificar el PM o el líder.
- Estado: pausar, reanudar e iniciar los hace PM o líder; cerrar y reabrir, solo el líder; toda transición exige motivo.
- Salud: se calcula al consultar; un proyecto sin línea base se evalúa sin guardarse; toda evaluación es provisional; las restas usan la desviación guardada con dos decimales; quien no ve importes ve el score pero no el detalle financiero.
- Cambios: propone el PM, decide el líder; una propuesta escrita sobre otra línea base no se puede aprobar; un hito reprogramado que entra en un cambio aprobado deja de contar como reprogramado.
- Evidencias: se admiten en hitos, riesgos y cambios; sube quien puede actualizar el elemento; retira PM o líder; el texto de una evidencia retirada deja de mostrarse pero permanece en la base.

### Validación y límites

- 126 pruebas de código pasan: 22 del motor, 11 de contratos, 11 de `service-kit`, 5 del gateway, 15 de Identidad, 48 de Proyectos, 5 de Salud y 9 de Plataforma. `typecheck` sin errores. Diez pruebas SQL pasan.
- Probado contra la base de pruebas: los ejemplos de las reglas; evaluación guardada una sola vez aun con peticiones simultáneas y reproducible desde sus entradas guardadas; línea base N+1 que mueve solo el hito listado y conserva la anterior; dos aprobadores simultáneos, una sola decisión; archivo falso, vacío o de más de 10 MB sin dejar fila ni archivo; retiro que elimina el archivo y conserva el registro; regla de 30 días a los 29 y a los 40 días.
- Por el gateway, con los cuatro servicios y los usuarios de demostración: DEMO-001 da 49.70 en riesgo y DEMO-002 da 97.52 saludable; el líder puede decidir el cambio pendiente; DEMO-002 tiene líneas base v1 y v2; editar DEMO-005 responde 409 hasta justificar; carga de un PDF por formulario, rechazo de un archivo falso, descarga permitida a la lectora del proyecto y negada con 404 a un PM de otra práctica.
- En navegador: lista con la marca "Requiere justificación" y pestaña Salud de DEMO-001 con score, reglas críticas y dimensiones explicadas.
- Límites: no se revisaron en navegador las pestañas Cambios, las tarjetas de estado y renovaciones ni el panel de evidencias, solo sus rutas por el gateway; no hay pruebas automáticas de pantallas; el proceso programado no existe, así que un vencimiento no cambia el score hasta que alguien consulta; Cliente y Gobernanza quedan sin dato; no hay tendencia ni pronóstico; sin limpieza de archivos huérfanos ni antivirus; `docker-compose.yml` sigue sin probarse.
- Al archivo `.env` del usuario se le añadieron las variables de Salud y Plataforma. Las evidencias de demostración se guardan en `.local/evidence`, fuera de Git.

### Pendientes y siguiente paso

Confirmar las interpretaciones de D02, D03, D04 y D08. Aceptación de R1 y R2. Después R3. Siguiente entrada: BIT-0023.

## BIT-0023 — Precisiones de D03 y D04

**Fecha:** 2026-10-04, America/Mexico_City.

**Objetivo:** registrar las precisiones que el usuario dio antes de iniciar R3.

**Relación:** D03, D04, D05, PHS-020, PHS-030 a PHS-032. Solo documentación.

**Identificación:** commit con prefijo `BIT-0023`.

### Decisiones indicadas por el usuario

- D03: el ciclo mensual es por mes calendario.
- D04: usar la regla del prototipo para plazos y responsables de las acciones, y registrarla.
- D04: un hito que se cumple resuelve su alerta; si no se cumple, el PM registra por qué se desvió y documenta un plan de remediación para cumplir la fecha o, si replanifica, el motivo; debe validarlo Dirección.

### Trabajo realizado y archivos

[DECISIONES.md](producto/DECISIONES.md) (tabla de precisiones y punto abierto), [ESPECIFICACION.md](producto/ESPECIFICACION.md) §7 y esta bitácora.

### Punto resuelto

La validación por Dirección contradecía D05. El usuario eligió entre alternativas: valida el líder y Dirección lo ve; replanificar es un cambio aprobado; la exigencia de causa y plan aplica a toda alerta crítica; y el día de corte semanal es configurable por proyecto.

### Pendientes y siguiente paso

Construir R3. Siguiente entrada: BIT-0024.

## BIT-0024 — Alertas, acciones y respuesta con causa y plan

**Fecha:** 2026-10-04, America/Mexico_City.

**Objetivo:** primer incremento de R3: detectar lo que va mal en un proyecto, asignar la acción y exigir al PM causa y plan validados por el líder.

**Relación:** PHS-030, PHS-031, PHS-032; D04 y D05 (BIT-0023); RN-15 a RN-17.

**Identificación:** commit con prefijo `BIT-0024`.

### Trabajo realizado

- **Base.** Migración [011](../db/migrations/011_event_response.sql): `event_response` y `event_response_validation`, de solo inserción, escritas por Salud; 35 tablas. Prueba [011](../db/tests/011_event_response.sql).
- **Salud.** [governance.service.ts](../apps/health/src/governance.service.ts) y su controlador. Al consultar un proyecto se abren alertas por hito vencido, mitigación de riesgo vencida, riesgo materializado, desviación de proyecto, desviación financiera, renovación próxima o vencida y cambio pendiente; cada una con un episodio y, salvo que el proyecto las tenga desactivadas, una acción automática con la regla del prototipo: responsable del elemento y 2 días para hitos y riesgos; PM y 5 días para desviaciones; responsable y 10 días, sin pasar del vencimiento, para renovaciones; líder y 7 días para cambios. Cuando la condición desaparece la alerta se resuelve y su acción automática abierta se cierra con una nota del sistema; si reaparece es un episodio nuevo. Completar la acción no resuelve la alerta.
- **Causa y plan (D04).** En hito vencido, mitigación vencida y las dos desviaciones, quien puede editar el proyecto registra la causa y un plan de remediación o una replanificación vinculada a una propuesta de cambio pendiente. El líder valida o devuelve con comentario; devuelta, el PM envía una versión nueva. Dirección lo ve y no decide.
- **Acciones.** Alta manual idempotente, transiciones (pendiente, en curso, bloqueada, completada, cancelada) con comentario obligatorio al cerrar y control de versión, y bandeja del usuario.
- **Gateway y contratos.** Prefijo público `/api/v1/governance` hacia Salud; siete rutas nuevas en `packages/contracts` y en `docs/api`.
- **Web.** [Governance.tsx](../apps/web/src/Governance.tsx): pestaña "Alertas y acciones" en el proyecto y sección "Mis acciones" en el menú.
- **Datos de demostración.** [seed-demo de Salud](../apps/health/src/cli/seed-demo.ts), añadido a `seed:demo`: detecta las alertas de los cinco proyectos y deja en DEMO-001 una respuesta en validación del líder y una acción manual.
- `AssessmentsService.inputs` pasa a ser público para reutilizar el cálculo de desviaciones.

### Archivos

`db/migrations/011_event_response.sql`, `db/tests/011_event_response.sql`, `apps/health/src/{governance.service,governance.controller,app.module,assessments.service}.ts`, `apps/health/src/cli/seed-demo.ts`, `apps/health/test/governance.int.test.ts`, `apps/health/package.json`, `apps/gateway/src/routes.ts`, `packages/contracts/src/{health,gateway}.ts`, `docs/api/{health,gateway}.openapi.json`, `docs/api/README.md`, `apps/web/src/{Governance,App,Projects}.tsx`, `apps/web/src/api.ts`, `scripts/local-db.sh`, y documentación: backlog, base de datos, mapa y esta bitácora.

### Decisiones y supuestos

- Aplicadas las decisiones del usuario de BIT-0023.
- Supuestos míos, sin confirmar: cerrar sola la acción automática cuando desaparece la causa; exigir causa y plan también en hitos vencidos no críticos y en mitigaciones vencidas de severidad media; no exigirlos en riesgo materializado, renovaciones ni cambios pendientes; validar la respuesta de replanificación no aprueba el cambio, que se decide en la pestaña Cambios.

### Validación y límites

- `pnpm typecheck` y `pnpm build` sin errores. `pnpm test`: 132 pruebas en 8 paquetes, todas aprobadas (Salud 11, seis de ellas nuevas). `pnpm db:test`: 11 de 11. La prueba SQL 011 falló una vez por un error de la propia prueba (reutilizaba un número de versión) y se corrigió.
- Por el gateway con los usuarios de demostración: DEMO-001 muestra seis alertas; el PM puede responder tres y tiene cuatro acciones; el líder puede validar la respuesta cargada y tiene dos acciones; Dirección ve las seis y no puede responder ni validar; la lectora no tiene acciones.
- **No comprobado:** las pantallas nuevas no se revisaron en el navegador (compilan y pasan la verificación de tipos); tampoco hay prueba de dos detecciones simultáneas.
- La detección ocurre al consultar, no en segundo plano (PHS-033); sin notificaciones (PHS-034).

### Pendientes y siguiente paso

Lo que falta de PHS-030 a PHS-032 está en el estado de cada historia en el backlog. Siguiente: prueba del usuario; después ciclo de revisión (PHS-020). Siguiente entrada: BIT-0025.

## BIT-0025 — Ciclo de revisión, Health Review y días festivos

**Fecha:** 2026-10-05, America/Mexico_City.

**Objetivo:** segundo incremento de R3: programar revisiones, mostrar lo esperado, capturar y enviar el Health Review como en el prototipo y que el líder lo valide o devuelva.

**Relación:** PHS-020 a PHS-024, PHS-017, PHS-046 (nueva); D02, D03, D05, D08, D09; RN-11 a RN-13.

**Identificación:** commit con prefijo `BIT-0025`.

### Decisiones del usuario (2026-10-05)

Al revisar una primera versión de este trabajo el usuario indicó:

1. Conservar la funcionalidad de la revisión que propone el prototipo. La primera versión solo dejaba una nota por tema; se rehízo.
2. La regla de revisión tardía queda como está, por ahora.
3. Los festivos se deben considerar y ser parametrizables, porque cambian cada año.
4. De acuerdo con que un proyecto pausado o cerrado no tenga revisiones; pidió una historia para ver ese reporte si no existía. No existía: se añadió PHS-046.
5. Los fines de semana son inhábiles.

### Trabajo realizado

- **Base.** Migraciones [012](../db/migrations/012_review_schedule.sql) (ancla, versión y autor en `review_policy`) y [013](../db/migrations/013_holiday.sql) (`holiday`; 36 tablas), con sus pruebas.
- **Calendario.** [cadence.ts](../apps/health/src/cadence.ts): semanal 7 días, quincenal 14, mensual por mes calendario con ajuste al último día; primer día de corte a partir de una fecha; salto de sábados, domingos y festivos al siguiente día hábil.
- **Revisiones.** [review.service.ts](../apps/health/src/review.service.ts) y su controlador:
  - Política por proyecto con control de versión. Guardarla programa el primer ciclo o mueve el que aún no tiene envío; los ciclos enviados conservan su política.
  - Expectativas: hitos, mitigaciones y acciones que vencen hasta la fecha del ciclo, renovaciones dentro del horizonte, cambios por decidir y alertas críticas sin causa y plan.
  - Borrador por usuario y ciclo, con control de versión.
  - Envío idempotente: revalida expectativas y versión del proyecto, rechaza "nada cambió" con alertas críticas sin tratar, exige soporte si la política lo pide, registra costo y esfuerzo en Proyectos y guarda revisión, evaluación oficial y siguiente ciclo en una transacción.
  - Validación del líder sobre el envío más reciente; devolver permite reenviar una versión consecutiva del mismo ciclo.
- **Festivos.** [holiday.service.ts](../apps/health/src/holiday.service.ts): consulta por año para cualquier usuario; alta y baja solo para administradores, auditadas. Al agregar un festivo, las revisiones sin enviar que vencían ese día se mueven.
- **Alertas.** Revisión vencida (acción para el PM, 1 día) y revisión devuelta (acción de corrección, 3 días); se resuelven solas al enviar. No aplican a proyectos pausados o cerrados.
- **Evaluación.** Evaluación del ciclo (`cycle`, `official`) al enviar; la clave de la evaluación operativa incluye el número de revisiones.
- **Plataforma.** La evidencia admite revisiones como destino: la ve quien ve el proyecto, la agregan el PM y el líder, y es adenda si la revisión ya fue validada.
- **Web.** [Reviews.tsx](../apps/web/src/Reviews.tsx): pestaña "Revisión" con configuración, lo esperado con botón "Atender", temas que abren hitos, riesgos, equipo y cambios dentro del formulario, finanzas, clima, confianza declarada con la sugerida por el sistema, soporte con comentario y archivo, guardado automático e historial; "Revisiones por validar" en "Mis acciones"; "Días festivos" en Administración.
- **Datos de demostración.** Festivos oficiales de México de 2026 y 2027; DEMO-001 con ciclo semanal abierto y borrador; DEMO-002 con revisión en validación del líder; DEMO-003 con revisión devuelta y su acción de corrección; DEMO-004 sin ciclo; DEMO-005 pausado.
- **Backlog.** PHS-046, consulta de proyectos pausados y cerrados (R4), sin construir.

### Archivos

`db/migrations/{012_review_schedule,013_holiday}.sql`, `db/tests/{012_review_schedule,013_holiday}.sql`, `apps/health/src/{cadence,review.service,review.controller,holiday.service,governance.service,assessments.service,projects.client,app.module}.ts`, `apps/health/src/cli/seed-demo.ts`, `apps/health/test/{cadence.test,review.int.test,governance.int.test}.ts`, `apps/platform/src/{evidence.service,projects.client}.ts`, `packages/contracts/src/{health,platform}.ts`, `docs/api/*.openapi.json`, `docs/api/README.md`, `apps/web/src/{Reviews,Projects,Governance,Admin}.tsx`, `apps/web/src/api.ts`, y documentación: backlog, decisiones, base de datos, mapa, ADR-002 y esta bitácora.

### Supuestos sin confirmar

- Una revisión que vence en día inhábil pasa al siguiente día hábil, no al anterior.
- Las demás interpretaciones marcadas "por confirmar" en la tabla de BIT-0025 de [DECISIONES.md](producto/DECISIONES.md).
- Quién envía: quien tiene el permiso de PM del proyecto. Quién valida: quien decide (líder de la práctica); la autoaprobación sigue permitida en el piloto.

### Validación y límites

- `pnpm typecheck` y `pnpm build` sin errores. `pnpm test`: 141 pruebas en 8 paquetes (Salud 20: nueve nuevas, cuatro de calendario y cinco de integración). `pnpm db:test`: 13 de 13.
- **Fallo intermitente sin explicar:** la prueba de festivos falló una vez dentro de `pnpm test` y no se reprodujo en 34 ejecuciones posteriores. No se capturó el mensaje. Se cambió para usar solo fechas lejanas propias; no hay evidencia de que esa fuera la causa.
- Otros fallos corregidos durante el trabajo: la migración 012 por un índice que ya existía, una prueba de BIT-0024 que insertaba una política sin ancla y el orden de detección de alertas al guardar la política.
- Por el gateway con los usuarios de demostración: ciclos en el estado esperado, bandeja del líder con la revisión de DEMO-002, acción de corrección de DEMO-003 en las acciones del PM, festivos de 2026 visibles para un PM y alta de festivo rechazada para quien no es administrador.
- **No comprobado:** las pantallas no se revisaron en el navegador (compilan y pasan la verificación de tipos). El alta y la baja de festivos como administrador no se probaron por el gateway porque la contraseña del administrador en `.env` ya no es la vigente; sí están cubiertas por la prueba de integración. El registro de costo desde la revisión se probó con un sustituto de Proyectos, no contra el servicio real. La evidencia en revisiones no tiene prueba automática propia; se comprobó a mano por el gateway (el PM agregó un texto a la revisión de DEMO-002 y el líder lo consultó).
- Límites: la política de soporte se cumple con el comentario, no con el archivo solo; el archivo no se guarda en el borrador; la confianza declarada se guarda pero no altera la calculada (PHS-027).

### Pendientes y siguiente paso

Prueba del usuario. Después PHS-027 a PHS-029 y PHS-033. Siguiente entrada: BIT-0026.

## BIT-0026 — Confianza, tendencia, proyección y proceso programado

**Fecha:** 2026-10-05, America/Mexico_City.

**Objetivo:** cerrar R3: explicar la confianza, comparar ciclos, proyectar los próximos y mantener todo al día sin usuarios conectados.

**Relación:** PHS-027, PHS-028, PHS-029, PHS-033; D01 (reglas v1), D03; RN-07 a RN-10, RN-16, RN-17.

**Identificación:** commit con prefijo `BIT-0026`.

### Trabajo realizado

- **Motor.** [outlook.ts](../packages/health-engine/src/outlook.ts): tendencia entre los dos últimos cortes de ciclo y proyección por factores, con los coeficientes ya documentados en las reglas v1; la confianza devuelve cada resta. Los coeficientes de tendencia y proyección se añadieron a la definición del conjunto de reglas.
- **Salud.**
  - `GET /assessments/:projectId/outlook`: tendencia y proyección sobre el horizonte del ciclo configurado.
  - La confianza cuenta las alertas críticas sin causa y plan como expectativas sin resolver, y la evaluación guarda sus restas.
  - La clave de la evaluación operativa incluye revisiones y alertas sin tratar, que cambian el resultado sin cambiar la versión del proyecto.
  - [scheduler.service.ts](../apps/health/src/scheduler.service.ts): cada `HEALTH_SCHEDULER_SECONDS` (300 por defecto, 0 lo apaga) recorre los proyectos no cerrados, sincroniza alertas y acciones y guarda la evaluación; candado para una sola pasada; fallos por proyecto registrados; `GET /scheduler` con la última pasada.
- **Base.** Migración [014](../db/migrations/014_scheduler_run.sql) y su prueba; 37 tablas.
- **Web.** La pestaña Salud muestra las causas de la confianza, el aviso de salud alta con confianza baja, la tendencia con ambos cortes, la proyección con sus factores y la última actualización automática.
- **Datos de demostración.** Segundo ciclo enviado en DEMO-002 para que la tendencia tenga dos cortes.

### Archivos

`packages/health-engine/src/{outlook,outlook.test,rules,assessment,assessment.test,index}.ts`, `apps/health/src/{assessments.service,assessments.controller,scheduler.service,review.controller,app.module}.ts`, `apps/health/src/cli/seed-demo.ts`, `apps/health/test/outlook.int.test.ts`, `db/migrations/014_scheduler_run.sql`, `db/tests/014_scheduler_run.sql`, `packages/contracts/src/health.ts`, `docs/api/{health,gateway}.openapi.json`, `docs/api/README.md`, `apps/web/src/{HealthView,Projects}.tsx`, `apps/web/src/api.ts`, `.env.example`, y documentación: backlog, reglas, base de datos, mapa, ADR-002 y esta bitácora.

### Decisiones y supuestos

- El usuario pidió continuar; sin decisiones nuevas suyas.
- Supuestos míos: "expectativa sin resolver" es una alerta crítica sin causa y plan; sin ciclo configurado el horizonte es de dos quincenas, como en el prototipo; el proceso programado vive dentro de Salud y corre cada cinco minutos.
- La definición guardada del conjunto de reglas `phf-v1` en bases ya creadas no incluye los coeficientes de tendencia y proyección, porque esa fila no se reescribe; los valores no cambiaron.

### Validación y límites

- `pnpm typecheck` y `pnpm build` sin errores. `pnpm test`: 150 pruebas en 8 paquetes (motor 27, Salud 24). `pnpm db:test`: 14 de 14.
- Por el gateway con datos de demostración: el proceso programado corrió solo y procesó 5 proyectos sin fallos; DEMO-002 muestra tendencia a la baja con sus dos cortes; DEMO-001 muestra proyección con sus factores y la confianza con sus causas.
- La evaluación de hoy guardada antes de este cambio no traía las causas de la confianza; el cambio de clave hace que se recalcule una vez.
- **No comprobado:** las pantallas no se revisaron en el navegador. No hay prueba con reloj simulado ni medición de los plazos NF-03.
- Límites: la proyección no se guarda; no hay despacho del outbox ni notificaciones; el registro de pasadas crece sin depurarse (unas 288 filas por día).

### Pendientes y siguiente paso

Aceptación del usuario de R1 a R3. Después R4. Siguiente entrada: BIT-0027.

## BIT-0027 — Histórico del proceso programado

**Fecha:** 2026-10-05, America/Mexico_City.

**Objetivo:** que el registro de pasadas del proceso programado deje de crecer sin límite, conservando lo útil.

**Relación:** PHS-033. Resuelve un límite anotado en BIT-0026.

**Identificación:** commit con prefijo `BIT-0027`.

### Decisión del usuario

Borrar lo viejo y conservarlo en un histórico. Entre tabla y archivo eligió la propuesta: tabla con un resumen por día. El detalle se conserva tres meses.

### Trabajo realizado

- Migración [015](../db/migrations/015_scheduler_run_daily.sql): `scheduler_run_daily` y permiso de borrado de `scheduler_run` para Salud; 38 tablas.
- [scheduler.service.ts](../apps/health/src/scheduler.service.ts): al terminar cada pasada, las de más de tres meses se resumen por día (UTC) y se borran en una transacción. Si el archivado falla, la pasada no falla y se reintenta en la siguiente.
- Cada fila diaria guarda pasadas, completadas, interrumpidas, pasadas con fallos, proyectos procesados y cada fallo distinto (proyecto y error) con el número de pasadas en que apareció.

### Archivos

`db/migrations/015_scheduler_run_daily.sql`, `db/tests/{014_scheduler_run,015_scheduler_run_daily}.sql`, `apps/health/src/scheduler.service.ts`, `apps/health/test/outlook.int.test.ts`, `docs/DATABASE-PHS.md`, `docs/producto/BACKLOG.md` y esta bitácora.

### Validación y límites

- `pnpm test`: 151 pruebas en 8 paquetes (Salud 25, una nueva). `pnpm db:test`: 15 de 15.
- Aclaración sobre BIT-0026: la prueba SQL 014 comprobaba que Salud no podía borrar pasadas. Desde la migración 015 sí puede, así que esa comprobación se quitó de la 014 (queda con 3 rechazos) y la 015 comprueba quién puede borrar.
- El histórico diario no tiene pantalla ni ruta de consulta; se lee en la base. El plazo de tres meses es una constante del código, no un parámetro.
- La base local del usuario no tiene pasadas de más de tres meses, así que ahí el archivado todavía no mueve nada; se comprobó con datos de prueba.

### Pendientes y siguiente paso

Aceptación del usuario de R1 a R3; después R4. Siguiente entrada: BIT-0028.

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
