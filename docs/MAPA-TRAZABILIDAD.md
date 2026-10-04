# Mapa de trazabilidad: pantalla → servicio → tablas → historias

Fecha: 2026-10-03, America/Mexico_City (BIT-0008). Cruce entre [ESPECIFICACION.md](producto/ESPECIFICACION.md) §4, [ADR-002](adr/002-microservicios.md), las migraciones 001–003 y [BACKLOG.md](producto/BACKLOG.md). Describe el diseño; ninguna pantalla ni servicio está construido.

Método y límite: se usaron la tabla de pantallas de la especificación, la línea "Datos / artefactos" de cada historia y el SQL. No se revisaron uno por uno todos los criterios de aceptación.

## Pantallas

Toda pantalla entra por el gateway. "Servicio" indica quién atiende la operación; "lee" indica tablas de otro servicio que consulta en la base compartida.

| Pantalla | Servicio | Tablas que escribe | Lee de otros | Historias | Reglas / NF |
| --- | --- | --- | --- | --- | --- |
| Acceso (inicio y cierre de sesión, cambio de contraseña) | Identidad | `user_credential`, `user_session` | — | PHS-005 | NF-04 |
| Administración de usuarios, prácticas y catálogos | Identidad; Proyectos para `service_type` | `app_user`, `user_credential`, `user_session`, `practice`, `practice_membership`, `service_type` | `project` (conteo de responsabilidades) | PHS-006, 007 | NF-04, RN-19 |
| Proyectos | Proyectos | `project`, `client` | membresías | PHS-009 | RN-01, RN-19 |
| Ficha del proyecto | Proyectos | `project`, `client`, `project_member`, `financial_observation`, `renewal` | `app_user` | PHS-009, 010, 012, 013, 014 | RN-01, 02, 07, 17, 19 |
| Línea base | Proyectos | `baseline`, `project.current_baseline_id` | — | PHS-011, 019 | RN-02, 14, 19 |
| Hitos | Proyectos; Plataforma para evidencia | `milestone`, `activity`, `evidence` | — | PHS-015, 017 | RN-02, 12, 17, 19; NF-10 |
| Riesgos | Proyectos; Plataforma para evidencia | `risk`, `activity`, `evidence` | — | PHS-016, 017 | RN-12, 17, 19 |
| Cambios | Proyectos | `project_change`, `change_decision`, `baseline` | — | PHS-018, 019 | RN-02, 14; NF-05 |
| Ciclo de revisión | Salud | `review_policy`, `review_cycle` | `project` | PHS-020 | RN-11–13, 17 |
| Health Review | Salud; comandos a Proyectos; Plataforma para evidencia | `review_draft`, `health_review`, `health_assessment`, `evidence` | compromisos | PHS-021, 022, 023 | RN-11–13, 19, 20; NF-01, 05 |
| Validaciones | Salud | `review_validation`, `health_task` | — | PHS-024 | RN-13, 19 |
| Salud del proyecto | Salud | `rule_set`, `health_assessment` | compromisos, baseline, economía | PHS-025–029 | RN-02–10 |
| Health Events | Salud | `health_event` | compromisos | PHS-030 | RN-15–17 |
| Acciones | Salud; Plataforma para evidencia | `health_task`, `activity`, `evidence` | — | PHS-031, 032 | RN-12, 15, 16, 19 |
| Alertas y prioridades | Salud; Plataforma para entregas | `notification_delivery` | `health_event`, `health_task` | PHS-034 | RN-15–18 |
| Health Center (PM, líder, Dirección) | Salud (consulta) | — | proyectos, ciclos, tareas, evaluaciones, membresías | PHS-035, 036, 037 | RN-08, 18, 20 |
| Portafolio | Salud (consulta) | — | `project`, `client`, `financial_observation` | PHS-037 | RN-01, 18 |
| Timeline e historial | Plataforma (consulta) | — | `activity`, `audit_entry`, baselines, evaluaciones, compromisos | PHS-038 | RN-17, 19 |
| Modelo PHF | Salud (consulta) | — | `rule_set` | PHS-039 | RN-03–10 |
| Simulación y demo (solo pruebas) | Utilidades de prueba | fixtures | — | PHS-040 | NF-09 |

## Sin pantalla propia

| Capacidad | Servicio | Tablas | Historias |
| --- | --- | --- | --- |
| Evaluación y vencimientos programados | Salud (proceso programado) | `health_assessment`, `health_event`, `health_task`, `outbox_message` | PHS-033 |
| Despacho de eventos y notificaciones | Plataforma | `outbox_message`, `notification_delivery` | PHS-033, 034 |
| Auditoría y control de concurrencia | Todos insertan; Plataforma consulta | `audit_entry`, columnas `revision` | PHS-008 |
| Sesión e identidad propagada | Gateway e Identidad | `user_session` | PHS-005, 006 |
| Definición, contratos y esquema | — | — | PHS-001–004 |
| Calidad, operación y piloto | Todos | roles de base, respaldos | PHS-040–042 |
| Posterior al MVP | — | — | PHS-043–045 |

## Tablas por servicio

| Servicio | Tablas (30 en total) |
| --- | --- |
| Identidad (5) | `app_user`, `user_credential`, `user_session`, `practice`, `practice_membership` |
| Proyectos (11) | `client`, `service_type`, `project`, `project_member`, `milestone`, `risk`, `renewal`, `financial_observation`, `project_change`, `change_decision`, `baseline` |
| Salud (9) | `review_policy`, `review_cycle`, `review_draft`, `health_review`, `review_validation`, `rule_set`, `health_assessment`, `health_event`, `health_task` |
| Plataforma (2) | `evidence`, `notification_delivery` |
| Compartidas de solo inserción (4) | `audit_entry`, `activity`, `outbox_message`, `command_idempotency` (desde BIT-0015; total 31 tablas) |

## Estado de construcción (BIT-0022)

Los cuatro servicios y el gateway existen. Construidas, pendientes de aceptación: acceso, administración, proyectos, ficha, equipo, hitos, riesgos, línea base, cambios, economía, evidencias en hitos y riesgos, renovaciones, estado del proyecto y salud del proyecto. Sin construir: ciclo de revisión, Health Review, validaciones, Health Events, acciones, alertas, Health Center, portafolio, timeline e historial, y modelo PHF.

Tablas añadidas desde este mapa: `command_idempotency`, `evidence_withdrawal` (Plataforma) y `project_status_log` (Proyectos); 33 en total.

**BIT-0024:** Health Events y Acciones están construidas en parte (pestaña "Alertas y acciones" del proyecto y bandeja "Mis acciones"), pendientes de aceptación; ver el estado de PHS-030 a PHS-032 en el backlog. Salud añade `event_response` y `event_response_validation`: 35 tablas.

## Brechas detectadas en el cruce

| # | Brecha | Estado |
| --- | --- | --- |
| 1 | `user_credential` y `user_session` no tenían historia; PHS-005 y PHS-007 hablaban de un proveedor externo. | Corregido en BIT-0008: criterios añadidos a PHS-005 y PHS-007. |
| 2 | PHS-004 decía "28 tablas". | Corregido en BIT-0008: 30 tablas. |
| 3 | La tabla de contratos de la arquitectura no cubría sesión, administración, ciclo de revisión, eventos ni alertas. | Corregido en BIT-0008 a nivel conceptual. Desde BIT-0014 las rutas implementadas (sesión, administración, proyectos y catálogo) tienen contrato OpenAPI en `docs/api`; ciclo, eventos y alertas lo tendrán al construirse. |
| 4 | La arquitectura lista entidades (`BaselineMilestone`, `MilestoneUpdate`, `ChangeImpact`, `ReviewRevision`, `TaskUpdate`) que la base resolvió con snapshots JSONB y `activity`. | Aclarado con nota en la arquitectura; el contrato JSONB sigue pendiente en PHS-004. |
| 5 | Enviar una revisión cruza Proyectos y Salud y deja de ser una transacción única. | Abierta: protocolo propuesto en ADR-002, por validar en PHS-003 y D02. |
| 6 | La regla de un escritor por tabla no la impone la base. | Abierta: roles de PostgreSQL por servicio en PHS-004/PHS-042. |
| 7 | Health Center y Portafolio leen tablas de Proyectos e Identidad desde Salud. | Aceptado por la base compartida; revisar si se separan los datos en el futuro. |
