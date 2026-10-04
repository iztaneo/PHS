# Bitácora del proyecto PHS

Memoria compartida de lo realizado, las decisiones, la validación y el trabajo pendiente. Este archivo se actualiza en el mismo commit que cada cambio, conforme a [AGENTS.md](../AGENTS.md).

## Estado actual para retomar

- **Producto:** Project Health System, para gobernar la salud de proyectos y servicios mediante PHF.
- **Disponible:** prototipo HTML, diagnóstico, arquitectura propuesta, diseño PostgreSQL, migraciones 001 (inicial), 002 (credencial local) y 003 (sesiones), pruebas de integridad, especificación funcional, backlog y plan de entregas.
- **Todavía no implementado:** backend de negocio, interfaz multiusuario conectada a PostgreSQL, autenticación real, motor de producción y workers.
- **Decisiones confirmadas:** PostgreSQL como base del MVP; stack TypeScript/React/NestJS; identidad del MVP validada en la base de datos (OIDC pospuesto); autoaprobación permitida y auditada durante el piloto. El equipo es una sola persona que desarrolla y aprueba.
- **Stack:** TypeScript, React/Vite, NestJS para API y worker, PostgreSQL 17, Kysely/pg, migraciones SQL/dbmate y Docker. Ver [stack](STACK-TECNOLOGICO.md) y [ADR-001](adr/001-stack-mvp.md); no está instalado y faltan infraestructura, volumen piloto y versiones exactas.
- **Supuesto no confirmado:** una empresa con varias prácticas. No se ha aprobado alcance SaaS multiempresa.
- **Backlog:** 45 elementos propuestos, 42 para el MVP y 3 posteriores; 171 criterios de aceptación. Ninguna historia se considera implementada por la existencia de estos documentos.
- **Decisiones abiertas:** D01–D04 y D07–D10 completas; D05 y D06 parcialmente confirmadas. Ver [DECISIONES.md](producto/DECISIONES.md).
- **Hallazgos de revisión sin corregir:** lista en BIT-0005, a resolver en PHS-004 mediante una migración nueva.
- **Repositorio:** local en `/Users/indra/Documents/ChatGPT/PHS`, rama `main`; remoto `origin` en [iztaneo/PHS](https://github.com/iztaneo/PHS), creado y verificado como privado. La publicación y sincronización de commits se comprueban con Git (`git status -sb`, `git ls-remote origin refs/heads/main`).
- **Siguiente paso funcional:** crear el esqueleto del monorepo (pnpm, web, API, worker) con versiones fijadas y la prueba mínima de punta a punta de PHS-003; después PHS-004 (dbmate y una migración `004` con los hallazgos 1–5 de BIT-0005) y PHS-005 (inicio de sesión contra `user_credential` y `user_session`, con hash Argon2id). D01 y D02 pueden resolverse antes de R2/R3.

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
