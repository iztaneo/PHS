# ADR-002 — Arquitectura de microservicios con base compartida

- Fecha: 2026-10-03, America/Mexico_City.
- Estado: **decisión del usuario** (dueño del proyecto, único desarrollador y aprobador). El detalle de protocolos es propuesta pendiente de validar en el esqueleto.
- Relación: D06, PHS-003, PHS-004, PHS-033 y PHS-042. Sustituye el "backend modular único" descrito en [ARQUITECTURA-PHS.md](../ARQUITECTURA-PHS.md) y [ADR-001](001-stack-mvp.md); las tecnologías de ADR-001 se conservan.

## Contexto

La arquitectura inicial proponía un backend modular con una API y un worker. El usuario indicó que no quiere una arquitectura monolítica y eligió, entre las alternativas presentadas, la división en servicios, el reparto de datos y la comunicación que se registran aquí. El equipo es una sola persona y el esquema existente depende de claves foráneas entre casi todas sus tablas.

## Decisión

1. **Cuatro servicios de negocio y un gateway**, cada uno desplegable por separado con NestJS:

| Servicio | Responsabilidad | Tablas que escribe |
| --- | --- | --- |
| Gateway | Único punto de entrada de la web. Valida la sesión, propaga la identidad a los servicios y enruta `/api/v1`. No contiene reglas de negocio. | Ninguna |
| Identidad | Usuarios, credenciales, sesiones, prácticas y membresías. | `app_user`, `user_credential`, `user_session`, `practice`, `practice_membership` |
| Proyectos | Clientes, proyectos, equipo, hitos, riesgos, renovaciones, economía, cambios y baselines. | `client`, `service_type`, `project`, `project_member`, `milestone`, `risk`, `renewal`, `financial_observation`, `project_change`, `change_decision`, `baseline` |
| Salud | Ciclos y revisiones, motor PHF, evaluaciones, eventos, acciones y consultas de gobierno. Incluye el proceso programado de vencimientos. | `review_policy`, `review_cycle`, `review_draft`, `health_review`, `review_validation`, `rule_set`, `health_assessment`, `health_event`, `health_task` |
| Plataforma | Evidencias, consulta de historial y auditoría, despacho del outbox y notificaciones. | `evidence`, `notification_delivery`; procesa `outbox_message` |

2. **Base de datos compartida con el esquema actual.** Un solo PostgreSQL y el esquema `phs` con sus 30 tablas y todas sus claves foráneas. Cada tabla tiene un único servicio que la escribe; los demás pueden leerla.
3. **Tablas compartidas de solo inserción.** `audit_entry`, `activity` y `outbox_message` las inserta cada servicio dentro de la misma transacción que su cambio de negocio. Es la única excepción a la regla de un escritor, y es lo que mantiene atómicos el cambio, su auditoría y su evento. Plataforma es quien las consulta, despacha y marca como procesadas.
4. **Comunicación.** REST síncrono entre servicios para comandos que pertenecen a otro servicio; eventos asíncronos publicados mediante `outbox_message` en PostgreSQL, con entrega al menos una vez y consumidores idempotentes. No se introduce un broker.

## Alternativas consideradas

| Alternativa | Resultado |
| --- | --- |
| Backend modular único (ADR-001) | Descartado por el usuario. |
| Ocho servicios, uno por módulo | No elegida: aprobar un cambio o enviar una revisión pasaría a ser una operación distribuida entre varios servicios. |
| Un esquema o una base por servicio | No elegida: elimina las claves foráneas entre servicios y obliga a rehacer el esquema probado. |
| Broker de mensajes (NATS, RabbitMQ) | No elegido: añade infraestructura; reconsiderar si el outbox no basta. |

## Consecuencias

- Se conservan la integridad referencial y las pruebas SQL existentes. Aprobar un cambio sigue siendo una sola transacción, dentro de Proyectos.
- **Acoplamiento por la base.** Los servicios comparten esquema: una migración puede afectar a varios y el orden de despliegue importa. No es independencia completa de datos; es una limitación aceptada de esta decisión. Las migraciones siguen siendo un único historial en `db/migrations`.
- **La regla de un escritor no la impone el esquema actual.** Se propone un rol de PostgreSQL por servicio, con escritura solo en sus tablas, inserción en las compartidas y lectura en el resto. Queda para PHS-004/PHS-042.
- **Operaciones que cruzan servicios.** Enviar una revisión modifica compromisos (Proyectos) y registra la revisión y su evaluación (Salud): deja de ser una transacción única. Propuesta pendiente de validar en PHS-003: Salud aplica los cambios operativos mediante comandos idempotentes de Proyectos y después registra la revisión con su snapshot; si falla a mitad, los cambios operativos quedan guardados, el borrador se conserva y el envío se reintenta. Rechazar "nada cambió" y la evaluación oficial dependen de este protocolo (D02).
- **Identidad entre servicios.** El gateway valida la sesión contra Identidad y entrega a cada servicio una identidad firmada de corta duración; los servicios no aceptan identidad enviada por el navegador y verifican permisos por práctica/proyecto en cada caso de uso leyendo las membresías.
- **Más piezas que operar.** Seis procesos desplegables (web, gateway y cuatro servicios) más el proceso programado de Salud, con sus contratos, salud y logs correlacionados por request ID. Para una sola persona es un costo real de construcción y operación.
- Los contratos OpenAPI pasan a ser uno por servicio; el gateway expone el contrato público.

## Implementación de la identidad entre servicios (BIT-0011)

Validado en ejecución con gateway, Identidad y Proyectos:

- La cookie de sesión (`HttpOnly`, `SameSite=Strict`) solo la conoce el gateway. Identidad no se expone por proxy: sus operaciones de sesión se publican en `/api/v1/session`.
- En cada petición a un servicio, el gateway valida la sesión contra Identidad, elimina la cookie y cualquier cabecera de identidad enviada por el navegador, y añade `x-phs-internal-auth`: identificador de usuario, de sesión y de petición firmados con HMAC-SHA256 y un secreto compartido (`INTERNAL_AUTH_SECRET`), válidos 60 segundos.
- Cada servicio rechaza peticiones sin esa firma. Identidad la exige también para iniciar sesión, de modo que solo el gateway puede llamarla.
- Límites: un único secreto compartido por todos los servicios, sin rotación definida; una consulta a Identidad por petición, sin caché; los servicios escuchan en 127.0.0.1 y el aislamiento de red del despliegue está por definir (PHS-042).

## Los cuatro servicios en ejecución (BIT-0022)

Salud y Plataforma se construyeron el 2026-10-04, con lo que existen los cuatro servicios y el gateway.

- **Llamadas entre servicios.** Salud y Plataforma no repiten las reglas de alcance: reenvían al servicio Proyectos la identidad que firmó el gateway y le preguntan si el usuario puede ver el proyecto o actualizar el elemento. Validado en ejecución. Costo: una o dos llamadas HTTP adicionales por petición y dependencia de que Proyectos esté disponible.
- **Evaluación al consultar.** Mientras no exista el proceso programado (PHS-033), Salud calcula y guarda la evaluación la primera vez que se pide para una versión de los datos y un día. Un `GET` puede escribir; la clave de idempotencia evita duplicados.
- **Roles de base.** Salud y Plataforma se conectan con sus propios usuarios; cada uno escribe solo sus tablas.
- **Proceso programado (BIT-0026).** Corre dentro del servicio Salud con un temporizador, no como proceso aparte: cada pasada repite todo el trabajo, que es idempotente, y un candado de PostgreSQL garantiza una sola pasada a la vez entre instancias. La evaluación al consultar se conserva para reflejar un cambio de inmediato.

## Envío de la revisión entre Salud y Proyectos (BIT-0025)

El usuario decidió conservar la funcionalidad del prototipo. Así quedó el protocolo propuesto arriba:

- Hitos, riesgos, equipo y cambios se editan desde el formulario de la revisión con las operaciones normales de Proyectos, en el momento; no esperan al envío.
- Costo y esfuerzo se capturan en el formulario. Al enviar, Salud valida todo lo demás y, como último paso antes de escribir, pide a Proyectos que registre la observación económica con la identidad del usuario y una clave derivada de la del envío. Después guarda revisión, evaluación oficial y siguiente ciclo en una transacción.
- Si falla algo después de registrar las cifras, estas quedan guardadas y el borrador se conserva; al reenviar, Salud ve que la observación del día ya tiene esos valores y no la repite.
- Límite: la observación incrementa la versión del proyecto, así que un reintento tras ese fallo recibe `revision_conflict` y la pantalla pide revisar y enviar de nuevo.

## Revisión de la decisión

Revisar si el acoplamiento por la base bloquea despliegues, si el protocolo de envío de revisión no logra la coherencia requerida por D02 o si el costo operativo supera la capacidad del equipo. Registrar una nueva ADR en lugar de sustituir esta.
