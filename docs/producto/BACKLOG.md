# PHS — Backlog de producto v0.1

Estado de todas las historias: **Propuesta / por refinar**. Ninguna funcionalidad se considera terminada porque exista en el prototipo o en el esquema SQL. 46 elementos: 43 del MVP y 3 candidatos posteriores (PHS-046 se añadió el 2026-10-05, BIT-0025). Los habilitadores técnicos tienen criterios verificables igual que las historias funcionales.

Prioridad: **P0** imprescindible para operación o integridad; **P1** completa la experiencia MVP; **P2** posterior. P1 también debe terminar para declarar este MVP completo. Tamaño **S/M/L** es una hipótesis relativa de complejidad, no puntos, horas ni compromiso de fechas. Las historias M/L se dividen en refinamiento si no caben en una iteración.

Cada dependencia es un ID de trabajo previo; las decisiones Dxx son condiciones adicionales para aceptar la historia. Las etiquetas R0–R5 son entregas propuestas, no sprints. Una historia puede prepararse con contratos simulados antes de completar dependencias, pero no aceptarse integrada.

Fuentes, reglas RN y requisitos NF están definidos en [ESPECIFICACION.md](ESPECIFICACION.md); decisiones pendientes en [DECISIONES.md](DECISIONES.md); secuencia y escenarios en [PLAN-ENTREGAS.md](PLAN-ENTREGAS.md).

## Índice priorizado por capacidad

| ID | Épica | Historia | Entrega | Prioridad | Tamaño | Dependencias | Decisiones |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PHS-001 | E01 | Resolver políticas del MVP | R0 | P0 | M | — | D02, D03, D04, D05, D08, D09, D10 |
| PHS-002 | E01 | Especificar reglas y ejemplos del motor PHF | R0 | P0 | M | — | D01 |
| PHS-003 | E01 | Definir arquitectura ejecutable y contratos | R0 | P0 | M | — | D06 |
| PHS-004 | E02 | Preparar persistencia y migraciones | R1 | P0 | M | PHS-003 | — |
| PHS-005 | E02 | Iniciar y cerrar sesión | R1 | P0 | M | PHS-003, PHS-004 | D06 |
| PHS-006 | E02 | Aplicar permisos por práctica y proyecto | R1 | P0 | M | PHS-001, PHS-005 | D05 |
| PHS-007 | E02 | Administrar usuarios, prácticas y catálogos | R1 | P0 | M | PHS-006 | D05 |
| PHS-008 | E02 | Implementar auditoría y control de concurrencia | R1 | P0 | M | PHS-004, PHS-005 | — |
| PHS-009 | E03 | Crear, consultar y editar proyectos | R1 | P0 | M | PHS-006, PHS-007, PHS-008 | — |
| PHS-010 | E03 | Gestionar contexto del cliente y equipo | R1 | P0 | M | PHS-009 | D05 |
| PHS-011 | E03 | Publicar y consultar baseline inicial | R1 | P0 | M | PHS-009, PHS-010, PHS-015 | — |
| PHS-012 | E03 | Registrar observaciones económicas | R2 | P0 | M | PHS-009, PHS-008 | — |
| PHS-013 | E03 | Gestionar renovaciones | R2 | P1 | S | PHS-009 | — |
| PHS-014 | E03 | Gestionar pausa, cierre y reapertura | R2 | P1 | M | PHS-001, PHS-009 | D08 |
| PHS-015 | E04 | Registrar y actualizar hitos | R1 | P0 | M | PHS-009, PHS-008 | D08 |
| PHS-016 | E04 | Registrar riesgos y su seguimiento | R2 | P0 | M | PHS-009, PHS-008 | — |
| PHS-017 | E04 | Adjuntar y consultar evidencias privadas | R2 | P0 | M | PHS-006, PHS-008, PHS-009 | D06, D09 |
| PHS-018 | E04 | Proponer cambios con impactos concretos | R2 | P0 | M | PHS-011, PHS-008 | — |
| PHS-019 | E04 | Aprobar o rechazar cambios | R2 | P0 | M | PHS-006, PHS-008, PHS-018 | D05 |
| PHS-020 | E05 | Configurar y programar ciclos de revisión | R3 | P0 | M | PHS-001, PHS-009, PHS-008 | D02, D03, D08 |
| PHS-021 | E05 | Calcular expectativas para la revisión | R3 | P0 | M | PHS-020, PHS-015, PHS-016, PHS-013, PHS-025 | D02, D03, D08 |
| PHS-022 | E05 | Preparar revisión adaptativa y recuperar borrador | R3 | P0 | M | PHS-020, PHS-021 | — |
| PHS-023 | E05 | Enviar Health Review consistente | R3 | P0 | M | PHS-022, PHS-017, PHS-026, PHS-008 | D02, D09 |
| PHS-024 | E05 | Validar, devolver y reenviar revisiones | R3 | P0 | M | PHS-023, PHS-006, PHS-032 | D02, D05, D09 |
| PHS-025 | E06 | Calcular métricas, dimensiones y gates | R2 | P0 | M | PHS-002, PHS-011, PHS-012, PHS-016 | D01, D08 |
| PHS-026 | E06 | Persistir y mostrar evaluaciones reproducibles | R2 | P0 | M | PHS-025, PHS-008 | D01, D02 |
| PHS-027 | E06 | Calcular confianza de la información | R3 | P0 | M | PHS-002, PHS-026, PHS-023 | D01 |
| PHS-028 | E06 | Comparar tendencia entre ciclos | R3 | P1 | M | PHS-024, PHS-026, PHS-002 | D01, D02 |
| PHS-029 | E06 | Proyectar presión de próximos ciclos | R3 | P1 | M | PHS-028, PHS-020, PHS-013, PHS-032 | D01, D03 |
| PHS-030 | E07 | Detectar y seguir episodios de salud | R3 | P0 | M | PHS-021, PHS-008 | D04 |
| PHS-031 | E07 | Generar acciones automáticas | R3 | P0 | M | PHS-030, PHS-032 | D04 |
| PHS-032 | E07 | Gestionar tareas manuales y seguimiento | R3 | P0 | M | PHS-009, PHS-008, PHS-017 | D04 |
| PHS-033 | E07 | Ejecutar evaluación y vencimientos en segundo plano | R3 | P0 | M | PHS-026, PHS-030, PHS-031, PHS-008 | D03, D06, D08 |
| PHS-034 | E07 | Consultar alertas y notificaciones internas | R4 | P0 | M | PHS-030, PHS-031, PHS-033, PHS-006 | D04 |
| PHS-035 | E08 | Construir Health Center del PM | R4 | P0 | M | PHS-023, PHS-026, PHS-032, PHS-034 | D05 |
| PHS-036 | E08 | Construir Health Center del líder | R4 | P1 | M | PHS-024, PHS-027, PHS-034 | D05 |
| PHS-037 | E08 | Construir portafolio y vista de Dirección | R4 | P1 | M | PHS-026, PHS-027, PHS-028, PHS-014, PHS-006 | D05, D10 |
| PHS-038 | E08 | Consultar timeline e historial completo | R4 | P1 | M | PHS-019, PHS-024, PHS-030, PHS-032, PHS-008 | D07 |
| PHS-039 | E08 | Publicar ayuda y modelo PHF | R4 | P1 | S | PHS-002, PHS-026 | — |
| PHS-046 | E08 | Consultar proyectos pausados y cerrados | R4 | P1 | S | PHS-014, PHS-006 | D08 |
| PHS-040 | E09 | Validar el recorrido integral con escenarios | R5 | P0 | M | PHS-019, PHS-024, PHS-027, PHS-028, PHS-029, PHS-033, PHS-035, PHS-036, PHS-037, PHS-038, PHS-039 | — |
| PHS-041 | E09 | Verificar usabilidad, accesibilidad y rendimiento | R5 | P0 | M | PHS-035, PHS-036, PHS-037, PHS-040 | D06, D07 |
| PHS-042 | E09 | Preparar operación y liberar piloto | R5 | P0 | M | PHS-040, PHS-041 | D06, D07, D09 |
| PHS-043 | E10 | Importar datos del prototipo | POST | P2 | M | PHS-009, PHS-011, PHS-040 | — |
| PHS-044 | E10 | Integrar notificaciones y herramientas externas | POST | P2 | L | PHS-034, PHS-042 | — |
| PHS-045 | E10 | Explorar asistencia inteligente | POST | P2 | L | PHS-042 | — |

## E01 — Definición y contratos

### PHS-001 — Resolver políticas del MVP

Como **dueño de producto**, quiero registrar las políticas de operación y alcance, para que el equipo construya el mismo producto.

**Entrega:** R0 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** Ninguna · **Decisiones pendientes:** D02, D03, D04, D05, D08, D09, D10

**Trazabilidad:** F1/F2/F4 y DECISIONES.md · RN-01, RN-11–18

**Datos / artefactos:** Registro de decisiones

Criterios de aceptación:

1. Cada decisión incluye alternativa elegida, responsable, fecha y ejemplos; las pendientes permanecen identificadas como tales.
2. El alcance aprobado enumera capacidades dentro/fuera del MVP y reglas para proyectos pausados/cerrados.
3. Las políticas de validación, permisos, calendario, evidencias y acciones actualizan sus historias afectadas; no se acepta solo una lista de preguntas.

### PHS-002 — Especificar reglas y ejemplos del motor PHF

Como **dueño PHF**, quiero formalizar fórmulas y casos de referencia, para obtener resultados consistentes por tipo de servicio.

**Entrega:** R0 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** Ninguna · **Decisiones pendientes:** D01

**Trazabilidad:** F3: DIMENSIONS, GATES, dim*, assess, confidence, trend, forecast · RN-02–10

**Datos / artefactos:** Contrato RuleSet

**Avance (BIT-0018):** [REGLAS-PHF-v1.md](REGLAS-PHF-v1.md) contiene fórmulas, entradas, redondeo y 15 ejemplos con resultado, incluidos los límites 10/10.01 y 3/3.01. Las decisiones y los detalles propuestos están confirmados por el usuario; falta la revisión de negocio con proyectos reales (criterio 3).

Criterios de aceptación:

1. Existe una tabla versionada con entradas, unidades, fórmula, ausencia de datos, precisión, redondeo, umbrales y explicación de cada dimensión, gate, confianza y forecast.
2. Los casos incluyen 10/10.01, 3/3.01, múltiples gates, presupuesto cero/ausente, cero hitos, riesgo materializado y fechas límite.
3. Cada caso tiene resultado calculado y revisado por negocio; las diferencias deliberadas frente a F3 quedan documentadas.
4. Una regla no calibrada se identifica como candidata; no se publica como política oficial.

### PHS-003 — Definir arquitectura ejecutable y contratos

Como **equipo técnico**, quiero seleccionar stack y contratos de los casos de uso, para implementar módulos compatibles.

**Entrega:** R0 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** Ninguna · **Decisiones pendientes:** D06

**Trazabilidad:** A1/A2 y ESPECIFICACION.md §9 · NF-05, NF-08, NF-09

**Datos / artefactos:** OpenAPI, contratos JSON y decisiones técnicas

**Avance documental:** [stack](../STACK-TECNOLOGICO.md), [ADR-001](../adr/001-stack-mvp.md), [ADR-002 de microservicios](../adr/002-microservicios.md) y [mapa de trazabilidad](../MAPA-TRAZABILIDAD.md) disponibles. Desde BIT-0009 existe un esqueleto ejecutable (web, gateway, Identidad, Proyectos). Desde BIT-0014 hay contratos OpenAPI generados y verificados para todas las rutas implementadas ([docs/api](../api/README.md)); del criterio 2 faltan paginación, filtros, versiones e idempotencia, que llegan con PHS-008/009. No completa la historia: faltan contratos OpenAPI por servicio, protocolo e identidad entre servicios, infraestructura y la prueba mínima con comando + auditoría + outbox.

Criterios de aceptación:

1. Se registran stack, identidad, despliegue, almacenamiento de archivos y forma de ejecutar workers; PostgreSQL se conserva.
2. OpenAPI describe recursos, paginación, filtros, errores, versiones e idempotencia de envíos y decisiones.
3. Los límites de servicios (ADR-002), propiedad de tablas, operaciones que cruzan servicios, manejo de transacciones y estrategia de pruebas se expresan en decisiones técnicas revisables.
4. Se documentan variables de entorno y datos sintéticos necesarios sin guardar secretos.


## E02 — Plataforma y acceso

### PHS-004 — Preparar persistencia y migraciones

Como **equipo técnico**, quiero disponer de un esquema consistente con los contratos, para guardar datos confiables.

**Entrega:** R1 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-003 · **Decisiones pendientes:** Ninguna específica

**Trazabilidad:** A2: 001_initial.sql; DECISIONES.md: brechas · RN-19, NF-09

**Datos / artefactos:** 30 tablas (migraciones 001–005) y roles de base por servicio

**Avance (BIT-0010):** dbmate, migraciones 004 y 005 con pruebas, instancia local sin Docker y clasificación de brechas en DECISIONES.md. No completa la historia: faltan el procedimiento de actualización y recuperación (criterio 4), el contrato de los JSONB y las brechas que dependen de D02–D04 y D08.

Criterios de aceptación:

1. En base vacía se aplican las migraciones y pasan las pruebas existentes sin alterar bases externas.
2. Cada brecha de DECISIONES.md queda clasificada como resuelta por contrato, cubierta por migración o dependiente de una decisión con historia vinculada.
3. Las ampliaciones ya definidas tienen migración y prueba de integridad; las políticas pendientes no se inventan para cerrar la historia.
4. Existe procedimiento de actualización y recuperación; datos históricos no se eliminan al evolucionar el esquema.

### PHS-005 — Iniciar y cerrar sesión

Como **usuario**, quiero acceder con mi identidad real, para que mis operaciones sean atribuibles.

**Entrega:** R1 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-003, PHS-004 · **Decisiones pendientes:** D06

**Trazabilidad:** F4: limitaciones; A1: identidad · NF-04

**Datos / artefactos:** app_user, user_credential, user_session

**Actualización 2026-10-03 (BIT-0008):** identidad validada en la base de datos (D06); atienden Identidad y el gateway. Criterios 5–7 añadidos; el 3 ya no depende de un proveedor externo.

**Estado (BIT-0011): en revisión, no aceptada.** Implementados y probados los criterios 1, 2 y 5–7, el cierre de sesión del 3 y la distinción de errores del 4. Pendiente del criterio 3: recuperar el borrador al vencer la sesión, que depende de PHS-022. Falta la aceptación del usuario.

Criterios de aceptación:

1. Una identidad válida y habilitada accede; la sesión identifica usuario sin aceptar un autor elegido desde el formulario.
2. Credenciales inválidas, usuario deshabilitado o sesión vencida no permiten operaciones protegidas.
3. Cerrar sesión revoca la sesión en el servidor de inmediato; al vencer durante captura se ofrece recuperar el borrador después de autenticar.
4. La UI distingue fallo temporal de autenticación y acceso no autorizado sin revelar datos de otros usuarios.
5. La contraseña se verifica contra un hash Argon2id; nunca se guarda ni se registra en claro. Tras el número de intentos fallidos acordado la cuenta se bloquea temporalmente, y la respuesta no revela si el correo existe.
6. La cookie de sesión es `HttpOnly` y lleva un token aleatorio del que solo se guarda el hash; la sesión caduca por límite absoluto y por inactividad, y el gateway entrega a los demás servicios la identidad validada, no la que envíe el navegador.
7. El usuario cambia su propia contraseña indicando la actual; con una credencial recién creada o restablecida debe cambiarla antes de operar, y el cambio revoca sus demás sesiones.

### PHS-006 — Aplicar permisos por práctica y proyecto

Como **responsable de acceso**, quiero limitar cada operación al alcance autorizado, para proteger proyectos y datos sensibles.

**Entrega:** R1 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-001, PHS-005 · **Decisiones pendientes:** D05

**Trazabilidad:** F1: pmView/leadView/directionView; F3: projectsForRole · NF-04

**Datos / artefactos:** practice_membership, project_member, project

**Estado (BIT-0013): en revisión, no aceptada.** Reglas de D05 implementadas como función pura y aplicadas en el servicio Proyectos (consulta de proyectos por alcance) y en la administración. Los criterios 1–4 están probados para consulta; los comandos de edición y aprobación se protegerán con las mismas reglas cuando existan (PHS-009 en adelante), y archivos y conteos con sus historias.

Criterios de aceptación:

1. PM A no obtiene proyecto de PM B fuera de alcance mediante URL, API, búsqueda, conteo ni archivo.
2. Líder y Dirección consultan solo prácticas asignadas; los comandos de aprobación exigen capacidad explícita.
3. Administrar usuarios no habilita automáticamente datos financieros o aprobaciones; se prueba combinación de roles.
4. La misma política se ejecuta en backend para listas y comandos; ocultar botones no es el control de acceso.

### PHS-007 — Administrar usuarios, prácticas y catálogos

Como **administrador**, quiero mantener identidades habilitadas y asignaciones, para incorporar usuarios sin editar la base manualmente.

**Entrega:** R1 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-006 · **Decisiones pendientes:** D05

**Trazabilidad:** F1: serviceType, roles; A2 · NF-04, RN-19

**Datos / artefactos:** app_user, user_credential, user_session, practice, practice_membership, service_type

**Actualización 2026-10-03 (BIT-0008):** credencial local (D06); criterio 5 añadido y criterio 1 sin proveedor externo.

**Estado (BIT-0013): en revisión, no aceptada.** Implementados y probados los cinco criterios: usuarios, credencial temporal y restablecimiento, prácticas, roles acumulables, tipos de servicio y auditoría. Del criterio 3, la reasignación se informa como conteo de proyectos abiertos; el detalle y la reasignación llegan con PHS-009/010. No hay edición del nombre o zona horaria de una práctica desde la pantalla.

Criterios de aceptación:

1. Un administrador autorizado crea prácticas, asigna roles y habilita/deshabilita usuarios.
2. Un tipo de servicio puede desactivarse para nuevas altas conservando proyectos que ya lo usaban.
3. Desactivar usuario conserva su autoría histórica y muestra responsables activos que necesitan reasignación.
4. Cambios de acceso quedan auditados y se aplican a solicitudes posteriores; una asignación no autorizada se rechaza.
5. El administrador crea la credencial inicial y restablece contraseñas con un valor temporal de un solo uso que no puede consultar después; deshabilitar un usuario o restablecer su contraseña revoca sus sesiones, y la auditoría no contiene contraseñas ni hashes.

### PHS-008 — Implementar auditoría y control de concurrencia

Como **equipo técnico**, quiero ejecutar cambios de forma transaccional, para evitar pérdidas silenciosas y efectos duplicados.

**Entrega:** R1 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-004, PHS-005 · **Decisiones pendientes:** Ninguna específica

**Trazabilidad:** A1/A2: transacciones y auditoría · RN-16, RN-19, NF-05

**Datos / artefactos:** audit_entry, outbox_message, revision

**Estado (BIT-0015): en revisión, no aceptada.** Criterios 1, 2 y 4 implementados y probados sobre los comandos de proyecto, con la tabla `command_idempotency`. Criterio 3: la revisión del proyecto aumenta al editar la ficha y, desde BIT-0016, al cambiar equipo, hitos y línea base, y desde BIT-0019 al cambiar riesgos y economía.

Criterios de aceptación:

1. Un comando guarda cambio y auditoría con usuario/request ID en una transacción; fallo provocado revierte ambos.
2. Dos editores con la misma revisión producen un éxito y un conflicto; la segunda captura no se sobrescribe silenciosamente.
3. Las actualizaciones de entradas del motor incrementan la revisión del proyecto; se verifica incluso al cambiar un hijo.
4. Reintentar el mismo comando idempotente devuelve el resultado original y rechaza reutilizar la clave con otro contenido.


## E03 — Proyectos y compromisos

### PHS-009 — Crear, consultar y editar proyectos

Como **PM**, quiero registrar la ficha de un proyecto, para establecer qué se gobierna y quién responde.

**Entrega:** R1 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-006, PHS-007, PHS-008 · **Decisiones pendientes:** Ninguna específica

**Trazabilidad:** F3: openProjectModal, validProject, views.projects/core · RN-01, RN-19

**Datos / artefactos:** project, client

**Estado (BIT-0015): en revisión, no aceptada.** Criterios 1–4 implementados y probados: alta con errores específicos, lista con búsqueda, filtros y paginación por alcance, y edición de la ficha. El aviso de definir la línea base es informativo hasta PHS-011. El código lo captura el usuario; el servidor no lo genera. No se edita el estado (PHS-014) ni el cliente o la práctica de un proyecto existente.

Criterios de aceptación:

1. Al guardar los campos obligatorios válidos se crea proyecto y se ofrece definir baseline; reabrir la página conserva los datos.
2. Código duplicado, fin anterior al inicio, responsable no habilitado o práctica no autorizada generan error específico sin alta parcial.
3. La lista admite búsqueda por nombre/código y filtros de cliente, tipo y estado, siempre paginados y autorizados.
4. La ficha permite editar datos descriptivos; modificar compromisos de una baseline vigente deriva al flujo de cambios.

### PHS-010 — Gestionar contexto del cliente y equipo

Como **PM**, quiero mantener contactos, escalación y responsables, para coordinar la operación del servicio.

**Entrega:** R1 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-009 · **Decisiones pendientes:** D05

**Trazabilidad:** F3: openTeamModal, readProjectForm; F1: client/team · RN-19

**Datos / artefactos:** client, project_member, project

**Estado (BIT-0016): en revisión, no aceptada.** Criterios 1–4 implementados y probados. El contacto y la escalación del proyecto son campos propios; los datos generales del cliente aún no se editan desde la aplicación. Al quitar a un integrante con responsabilidades abiertas se exige confirmación explícita de que las conserva; la reasignación de esos elementos se hace desde cada hito.

Criterios de aceptación:

1. La ficha distingue datos generales del cliente y contacto/escalación específicos del proyecto según contrato definido.
2. Agregar integrante exige usuario habilitado y asignación entre 0 y 100; una asignación duplicada no genera dos miembros.
3. Reasignar PM/líder/técnico conserva autores históricos y aplica permisos conforme D05.
4. Quitar integrante advierte sobre responsabilidades vigentes y exige resolverlas o conservar acceso explícito antes de confirmar.

### PHS-011 — Publicar y consultar baseline inicial

Como **PM**, quiero fijar los compromisos del proyecto, para tener una referencia histórica verificable.

**Entrega:** R1 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-009, PHS-010, PHS-015 · **Decisiones pendientes:** Ninguna específica

**Trazabilidad:** F2: Baseline; F3: saveBaseline · RN-02, RN-14, RN-19

**Datos / artefactos:** baseline, project.current_baseline_id

**Estado (BIT-0016): en revisión, no aceptada.** Criterios 1–4 implementados y probados para la versión inicial. La comparación entre versiones y las versiones posteriores llegan con PHS-019.

Criterios de aceptación:

1. El usuario revisa alcance, fechas, presupuesto/horas, equipo y detalle de hitos antes de publicar versión 1.
2. Al confirmar, baseline queda inmutable y vinculada al proyecto; un segundo intento no crea otra versión inicial.
3. Falta de presupuesto se conserva como desconocido y se advierte; importes negativos y fechas inválidas se rechazan.
4. Cambiar datos operativos después no modifica el snapshot; nuevas referencias posteriores se crean por cambio aprobado.

### PHS-012 — Registrar observaciones económicas

Como **PM**, quiero actualizar costo y esfuerzo acumulados, para medir evolución financiera contra la baseline.

**Entrega:** R2 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-009, PHS-008 · **Decisiones pendientes:** Ninguna específica

**Trazabilidad:** F3: saveFinance, financialDeviation; F1: metrics · RN-02, RN-07, RN-19

**Datos / artefactos:** financial_observation, baseline

**Estado (BIT-0019): en revisión, no aceptada.** Criterios 1–4 implementados y probados. La desviación se calcula con las reglas versión 1 (costo contra avance real). La moneda del proyecto no se puede cambiar desde la aplicación.

Criterios de aceptación:

1. Se registra fecha efectiva, costo acumulado, esfuerzo opcional y origen en moneda del proyecto.
2. Consultar a una fecha selecciona la observación aplicable; no suma varios acumulados.
3. Una corrección enlaza la observación anterior y conserva ambas; valores negativos y autor ajeno se rechazan.
4. La UI distingue presupuesto, gasto real y desviación calculada; no permite cambiar moneda cuando invalida historia.

### PHS-013 — Gestionar renovaciones

Como **PM**, quiero registrar fechas y resultado de renovación, para anticipar la continuidad del servicio.

**Entrega:** R2 · **Prioridad:** P1 · **Tamaño orientativo:** S

**Dependencias:** PHS-009 · **Decisiones pendientes:** Ninguna específica

**Trazabilidad:** F3: openRenewalModal, saveRenewal · RN-17, RN-19

**Datos / artefactos:** renewal

**Estado (BIT-0022): en revisión, no aceptada.** Criterios 1–3 implementados y probados. La renovación aparece en la ficha; las "consultas de próximos compromisos" del criterio 1 dependen de las vistas de gobierno (R4).

Criterios de aceptación:

1. Registrar renovación exige fecha y responsable con acceso; aparece en ficha y consultas de próximos compromisos.
2. Renovar o cancelar exige comentario y conserva fecha original y resultado.
3. Un nuevo periodo crea otra renovación sin borrar la anterior; editar simultáneamente no pierde cambios.

### PHS-014 — Gestionar pausa, cierre y reapertura

Como **líder**, quiero controlar el ciclo de vida del proyecto, para mantener una cartera vigente sin perder historia.

**Entrega:** R2 · **Prioridad:** P1 · **Tamaño orientativo:** M

**Dependencias:** PHS-001, PHS-009 · **Decisiones pendientes:** D08

**Trazabilidad:** F1: projectStatus; F3: PROJECT_STATUS · RN-01, RN-17, RN-19

**Datos / artefactos:** project, audit_entry

**Estado (BIT-0022): en revisión, no aceptada.** Criterios 1 y 2 implementados y probados, con la regla D08: tras 30 días pausado o cerrado se exige describir el motivo antes de editar. Del criterio 3, el efecto sobre ciclos y alertas espera a que existan (R3); las evaluaciones históricas no se recalculan.

Criterios de aceptación:

1. Cada transición permitida requiere motivo y deja fecha/autor; una transición inválida se rechaza en servidor.
2. Cerrar muestra acciones y riesgos abiertos y aplica la política acordada sin eliminarlos.
3. Pausar/cerrar/reabrir modifica ciclos y alertas según D08, con casos comprobables; no recalcula retroactivamente evaluaciones históricas.


## E04 — Operación y cambios

### PHS-015 — Registrar y actualizar hitos

Como **PM**, quiero gestionar entregables con fechas y responsables, para medir cumplimiento de compromisos.

**Entrega:** R1 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-009, PHS-008 · **Decisiones pendientes:** D08

**Trazabilidad:** F3: createMilestone, saveMilestoneUpdate · RN-02, RN-12, RN-17, RN-19

**Datos / artefactos:** milestone, activity, baseline

**Estado (BIT-0016): en revisión, no aceptada.** Criterios 1, 3 y 4 implementados y probados; del 2, completar registra fecha real y comentario, y la imagen de evidencia depende de PHS-017. Cancelar y reabrir funcionan con comentario obligatorio, de forma provisional hasta D08.

Criterios de aceptación:

1. Al registrar un hito válido se muestran entregable, responsable, fecha y criticidad; fin de fecha se interpreta en zona del proyecto.
2. Completar registra fecha real y comentario; cuando la política exige imagen se utiliza el contrato de evidencias de PHS-017.
3. Una reprogramación operativa conserva fecha base y razón, y no se considera aprobada por existir cualquier cambio aprobado ese día.
4. Un hito pendiente después de su fecha aparece vencido; completado no aparece abierto. Cancelar/reabrir sigue D08 y deja historial.

### PHS-016 — Registrar riesgos y su seguimiento

Como **responsable de riesgo**, quiero actualizar exposición y mitigación, para actuar antes de materializar el impacto.

**Entrega:** R2 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-009, PHS-008 · **Decisiones pendientes:** Ninguna específica

**Trazabilidad:** F3: createRisk, saveRiskUpdate, openRiskHistory · RN-12, RN-17, RN-19

**Datos / artefactos:** risk, activity

**Estado (BIT-0019): en revisión, no aceptada.** Criterios 1–4 implementados y probados. Desde la pantalla el seguimiento cambia comentario y estado; cambiar probabilidad, impacto, fecha, estrategia o responsable está en la API pero aún no en la pantalla.

Criterios de aceptación:

1. El alta exige título, tipo, categoría, probabilidad, impacto, dueño y fecha; valores fuera de catálogo se rechazan.
2. Cada seguimiento registra comentario y antes/después de probabilidad, impacto, fecha, estrategia y estado.
3. Materializar no se interpreta como mitigar; cerrar requiere explicación y conserva historial.
4. La lista distingue abiertos, mitigados, materializados y vencidos; responsables sin acceso no pueden actualizar mediante API.

### PHS-017 — Adjuntar y consultar evidencias privadas

Como **usuario autorizado**, quiero respaldar actualizaciones con texto o imágenes, para dar contexto verificable.

**Entrega:** R2 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-006, PHS-008, PHS-009 · **Decisiones pendientes:** D06, D09

**Trazabilidad:** F1: support; F3: readSupportImage, readMsImage · RN-12, NF-10

**Datos / artefactos:** evidence, almacenamiento privado

**Estado (BIT-0022): en revisión, no aceptada.** Criterios 1–4 implementados y probados para hitos, riesgos y cambios, con la política D09. Evidencia de revisiones y de acciones llegará con esas pantallas. No hay limpieza de archivos huérfanos ni análisis antivirus.

Criterios de aceptación:

1. Adjuntar exige proyecto y una entidad compatible del mismo proyecto; texto o imagen válida queda asociado a autor y fecha.
2. Tipo real, tamaño y límites acordados se validan; archivo falso, incompleto o sobredimensionado no produce evidencia usable.
3. Usuario sin alcance no descarga imagen aun con la URL/ID; la UI informa carga fallida y permite reintentar sin duplicar vínculo.
4. Evidencia de revisión validada no se sustituye; una adenda posterior se identifica según D09.

### PHS-018 — Proponer cambios con impactos concretos

Como **PM**, quiero registrar cambios de tiempo, costo, esfuerzo o alcance, para solicitar una nueva referencia controlada.

**Entrega:** R2 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-011, PHS-008 · **Decisiones pendientes:** Ninguna específica

**Trazabilidad:** F3: createChange; F2: Project Change · RN-02, RN-14

**Datos / artefactos:** project_change, contrato requested_impact

**Estado (BIT-0022): en revisión, no aceptada.** Criterios 1–4 implementados y probados. Desde la pantalla se propone un hito por cambio; la API admite varios.

Criterios de aceptación:

1. La propuesta identifica baseline de referencia, áreas, motivo y elementos afectados con valores antes/propuestos.
2. Impactar hitos exige seleccionarlos explícitamente; no se infiere que todos deben moverse.
3. Enviar conserva propuesta y autor sin alterar baseline ni eliminar desviaciones actuales.
4. Una propuesta enviada es inmutable; corrección se presenta como nueva propuesta con referencia a la anterior según contrato.

### PHS-019 — Aprobar o rechazar cambios

Como **líder**, quiero decidir un cambio y publicar su baseline, para mantener compromisos autorizados y trazables.

**Entrega:** R2 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-006, PHS-008, PHS-018 · **Decisiones pendientes:** D05

**Trazabilidad:** F3: applyChangeDecision; F2: Change Approval → Baseline · RN-02, RN-14, NF-05

**Datos / artefactos:** change_decision, baseline, project, outbox_message

**Estado (BIT-0022): en revisión, no aceptada.** Criterios 1–3 implementados y probados; del 4, la pantalla muestra la versión anterior y la nueva, sin una comparación lado a lado ni la explicación del cambio de desviación.

Criterios de aceptación:

1. Con permiso y propuesta vigente, aprobar guarda decisión, versión N+1 completa, compromisos afectados y auditoría de forma atómica.
2. Rechazar exige comentario y deja baseline y compromisos sin cambios; solo queda una decisión por propuesta.
3. Una baseline modificada desde la propuesta provoca conflicto y revisión de impactos antes de aprobar; dos aprobadores no aplican dos veces el delta.
4. Se puede comparar versión previa/nueva y explicar el cambio de desviación; un fallo intermedio revierte toda la operación.


## E05 — Ciclo de revisión

### PHS-020 — Configurar y programar ciclos de revisión

Como **PM**, quiero establecer cadencia y políticas del proyecto, para mantener información oportuna.

**Entrega:** R3 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-001, PHS-009, PHS-008 · **Decisiones pendientes:** D02, D03, D08

**Trazabilidad:** F3: saveCycle, CADENCES, CYCLE_DEFAULT · RN-11–13, RN-17

**Datos / artefactos:** review_policy, review_cycle

Criterios de aceptación:

1. Guardar semanal/quincenal/mensual, próxima fecha, horizonte y políticas genera ciclo con snapshot de configuración.
2. Casos de fin de mes, año bisiesto, revisión tardía y zona horaria tienen próxima fecha conforme D03.
3. Cambiar política no altera ciclos ya enviados; pausar/cerrar sigue D08.
4. Un proyecto sin ciclo se muestra incompleto; no recibe un ciclo implícito silencioso.

**Estado (BIT-0025):** construida, en revisión. Cadencia, próxima fecha, horizonte y políticas; el día de corte sale de la próxima fecha; mensual por mes calendario con ajuste al último día; una revisión tardía no desplaza el calendario; una revisión nunca vence en sábado, domingo ni festivo (pasa al siguiente día hábil) y los festivos los mantiene el administrador. Cambiar la política mueve solo el ciclo sin envío. Límites: un proyecto pausado o cerrado no genera alerta de revisión ni admite envíos, y al reanudarlo el PM reprograma la próxima fecha.

### PHS-021 — Calcular expectativas para la revisión

Como **PM**, quiero ver lo que debería haber cambiado, para atender compromisos sin depender de mi memoria.

**Entrega:** R3 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-020, PHS-015, PHS-016, PHS-013, PHS-025 · **Decisiones pendientes:** D02, D03, D08

**Trazabilidad:** F3: expectations; F2: Expectation Engine · RN-11, RN-17

**Datos / artefactos:** Consultas de compromisos, ciclos, tareas y motor

Criterios de aceptación:

1. Se muestran hitos, mitigaciones, acciones, revisiones, renovaciones y cambios relevantes con fecha, criticidad y enlace al origen.
2. Las ventanas temporales aplican la política acordada; un elemento resuelto deja de requerir el mismo tratamiento.
3. Las expectativas se recalculan al enviar, no solo al abrir el formulario.
4. La revisión del propio ciclo vencido no genera un bloqueo circular según D02; una tarea vencida conserva su identidad.

**Estado (BIT-0025):** construida, en revisión. Lista hitos, mitigaciones y acciones que vencen hasta la fecha del ciclo, renovaciones dentro del horizonte, cambios por decidir y alertas críticas sin causa y plan, cada una con un botón "Atender" que lleva a su pestaña; se recalcula al enviar.

### PHS-022 — Preparar revisión adaptativa y recuperar borrador

Como **PM**, quiero registrar solo los cambios relevantes, para reducir esfuerzo y no perder captura.

**Entrega:** R3 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-020, PHS-021 · **Decisiones pendientes:** Ninguna específica

**Trazabilidad:** F3: ensureDraft, toggleTopic, toggleNothing; F1: changes · RN-11, RN-20, NF-01

**Datos / artefactos:** review_draft

Criterios de aceptación:

1. El formulario muestra expectativas y solo solicita campos de los temas seleccionados; datos conocidos aparecen precargados.
2. “Nada cambió” y selección de temas son excluyentes; se explica qué condición impide esa opción.
3. El borrador persiste para usuario/ciclo y puede recuperarse tras recarga o nueva sesión sin mezclar proyectos.
4. Duración activa excluye espera de validación; errores de red no muestran confirmación falsa ni borran la captura.

**Estado (BIT-0025):** construida, en revisión. Como en el prototipo: se elige qué cambió (cronograma, hitos, riesgos, cliente, finanzas, alcance, equipo) y cada tema abre en el mismo formulario el lugar donde vive ese dato; "nada cambió" es excluyente y explica qué lo impide; borrador por usuario y ciclo con guardado automático; tiempo de captura. Se precargan el clima del cliente, el costo y el esfuerzo vigentes. El archivo de soporte no se guarda en el borrador.

### PHS-023 — Enviar Health Review consistente

Como **PM**, quiero confirmar la revisión con soporte, para publicar información trazable para el ciclo.

**Entrega:** R3 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-022, PHS-017, PHS-026, PHS-008 · **Decisiones pendientes:** D02, D09

**Trazabilidad:** F3: submitReview; F2: Health Review · RN-11–13, RN-19, NF-05

**Datos / artefactos:** health_review, evidence, health_assessment, review_cycle

Criterios de aceptación:

1. El servidor revalida expectativas y política; “nada cambió” con condición crítica sin tratamiento devuelve causa y conserva borrador.
2. Si corresponde evidencia y no existe texto/imagen válida, no se envía; no basta una carga de archivo incompleta.
3. Cambios operativos, revisión y evaluación pertinente se registran consistentemente; el nuevo clima/costo se refleja en el snapshot correcto.
4. Reintentar el envío devuelve la misma revisión; conflicto de versión requiere reconciliar antes de confirmar.
5. La respuesta distingue pendiente de validación o cerrada según D02 y programa el ciclo conforme política.

**Estado (BIT-0025):** construida, en revisión. Criterios 1 a 5 implementados y probados. El costo y el esfuerzo capturados se registran en Economía al enviar; revisión, evaluación oficial y siguiente ciclo se guardan en una transacción. Límites: la política de soporte se cumple con el comentario (el archivo es adicional y se adjunta justo después del envío, a diferencia del prototipo, donde bastaba la imagen); la evaluación oficial solo se guarda si el proyecto tiene línea base.

### PHS-024 — Validar, devolver y reenviar revisiones

Como **líder**, quiero revisar la información enviada, para controlar calidad sin borrar las correcciones.

**Entrega:** R3 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-023, PHS-006, PHS-032 · **Decisiones pendientes:** D02, D05, D09

**Trazabilidad:** F3: openReviewDetail, validateReview · RN-13, RN-19

**Datos / artefactos:** review_validation, health_review, health_task

Criterios de aceptación:

1. La bandeja muestra solo revisiones pendientes de su alcance, con datos, evidencia y evaluación de ese envío.
2. Validar/devolver exige comentario y permiso; una segunda decisión del mismo envío no crea otro resultado.
3. Devolver conserva el envío original y genera una acción de corrección deduplicada; el PM puede reenviar versión consecutiva del mismo ciclo.
4. El efecto en evaluación oficial y vencimiento del ciclo coincide con D02; el líder no valida una versión distinta de la que revisó.

**Estado (BIT-0025):** construida, en revisión. Bandeja del líder en "Mis acciones" con datos, soporte adjunto y evaluación del envío; validar o devolver con comentario; acción de corrección única para el PM que se cierra al reenviar; rechazo de una versión ya reemplazada.


## E06 — Motor de salud

### PHS-025 — Calcular métricas, dimensiones y gates

Como **líder**, quiero obtener indicadores explicables, para identificar por qué se deteriora un proyecto.

**Entrega:** R2 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-002, PHS-011, PHS-012, PHS-016 · **Decisiones pendientes:** D01, D08

**Trazabilidad:** F3: plannedProgress, financialDeviation, dim*, gateStatus · RN-02–07

**Datos / artefactos:** Motor PHF y rule_set

**Estado (BIT-0022): en revisión, no aceptada.** `packages/health-engine` calcula avance, desviaciones, las seis dimensiones, los seis topes, score, semáforo y confianza, con explicación por resta, y se prueba sin navegador ni base. Cliente y Gobernanza dan "sin dato" hasta que existan revisiones y ciclos.

Criterios de aceptación:

1. Cada caso aprobado en PHS-002 produce el resultado esperado usando baseline vigente y datos de la fecha efectiva.
2. Los gates se activan por condiciones sin redondear previamente; se aplican umbrales estrictos y mínimo tope.
3. Los datos ausentes se distinguen de cero y los cambios ya incorporados no se suman otra vez.
4. Para cada resultado se devuelve dato de origen, unidad, fórmula/regla y versión; el módulo se prueba sin navegador ni base.

### PHS-026 — Persistir y mostrar evaluaciones reproducibles

Como **PM**, quiero consultar la salud con su explicación, para entender y verificar el resultado.

**Entrega:** R2 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-025, PHS-008 · **Decisiones pendientes:** D01, D02

**Trazabilidad:** F3: assess, views.health, snapshotScores; A2 · RN-03–07, RN-13, RN-19

**Datos / artefactos:** health_assessment, rule_set

**Estado (BIT-0022): en revisión, no aceptada.** Criterios 1–3 implementados y probados en el servicio Salud. Del 4, no hay worker todavía: la evaluación se calcula al consultarla y la clave de idempotencia evita duplicados. Un proyecto sin línea base se evalúa pero no se guarda, porque el esquema exige una línea base por evaluación. Toda evaluación es provisional; las oficiales llegan con los cortes de ciclo.

Criterios de aceptación:

1. La evaluación guarda baseline, reglas, versión de entradas, fecha efectiva, dimensiones, gates y explicación; el score respeta promedio y tope.
2. La pantalla distingue provisional/oficial, dato obsoleto y sin evaluación; muestra fecha de cálculo y no pinta verde por ausencia de datos.
3. Recalcular históricamente crea otro registro; reproducir snapshot con la misma versión del motor devuelve el mismo resultado.
4. Un worker con revisión de proyecto antigua no reemplaza como actual una evaluación más reciente; reintento no duplica assessment.

### PHS-027 — Calcular confianza de la información

Como **líder**, quiero distinguir salud de calidad del dato, para priorizar revisiones poco confiables.

**Entrega:** R3 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-002, PHS-026, PHS-023 · **Decisiones pendientes:** D01

**Trazabilidad:** F3: confidence; F1: confidence/reviewConfidence · RN-07, RN-08

**Datos / artefactos:** health_assessment y snapshots de revisión

Criterios de aceptación:

1. Confianza considera actualidad, datos faltantes, soporte y condiciones según coeficientes aprobados.
2. La UI explica cada penalización y muestra score de salud por separado.
3. Un proyecto con score alto y baja confianza aparece claramente marcado; ausencia de soporte o review produce el caso esperado.
4. El cálculo histórico usa soportes/datos del corte y no cambia al agregar posteriormente una adenda.

**Estado (BIT-0026):** construida, en revisión. La confianza se calcula con las reglas v1 y ahora explica cada resta; "expectativa sin resolver" quedó definida como alerta crítica sin causa y plan. La pantalla de salud lista las causas y avisa cuando hay salud alta con confianza baja. La confianza que declara el PM en la revisión se guarda pero no modifica la calculada. La marca en listados y portafolio llega con R4.

### PHS-028 — Comparar tendencia entre ciclos

Como **líder**, quiero ver si la salud mejora o empeora, para detectar deterioro sostenido.

**Entrega:** R3 · **Prioridad:** P1 · **Tamaño orientativo:** M

**Dependencias:** PHS-024, PHS-026, PHS-002 · **Decisiones pendientes:** D01, D02

**Trazabilidad:** F3: trend; F1: trend · RN-09

**Datos / artefactos:** health_assessment, review_cycle

Criterios de aceptación:

1. La tendencia compara cortes oficiales de dos ciclos consecutivos comparables y muestra ambos scores/fechas.
2. Ediciones intradía y recálculos retrospectivos no se cuentan como ciclos nuevos.
3. Con menos de dos cortes se muestra histórico insuficiente; cambios de reglas quedan señalados y no se mezclan sin política definida.

**Estado (BIT-0026):** construida, en revisión. Compara la evaluación oficial del último envío de los dos ciclos más recientes y muestra ambos scores y fechas; dos ciclos con reglas distintas no se comparan y se dice por qué.

### PHS-029 — Proyectar presión de próximos ciclos

Como **PM**, quiero ver un forecast explicable, para anticipar compromisos que requieren intervención.

**Entrega:** R3 · **Prioridad:** P1 · **Tamaño orientativo:** M

**Dependencias:** PHS-028, PHS-020, PHS-013, PHS-032 · **Decisiones pendientes:** D01, D03

**Trazabilidad:** F3: forecast; F1: forecast · RN-10, RN-17

**Datos / artefactos:** health_assessment.forecast

Criterios de aceptación:

1. El horizonte deriva de ciclos y calendario acordados; el resultado identifica hitos, riesgos, acciones y renovaciones que aportan presión.
2. La proyección aplica reglas versionadas aprobadas y se presenta como escenario determinista, no probabilidad de fracaso.
3. Los límites de ventana, ausencia de historia y compromisos resueltos tienen pruebas; cada factor enlaza a su origen autorizado.

**Estado (BIT-0026):** construida, en revisión. Presión con los coeficientes v1 sobre el horizonte del ciclo configurado (o dos quincenas, indicándolo, si no hay ciclo); cada factor se nombra y lleva a su pestaña. Límites: se calcula al consultar y no se guarda en `health_assessment.forecast`; el enlace lleva a la pestaña, no al elemento.


## E07 — Eventos y acciones

### PHS-030 — Detectar y seguir episodios de salud

Como **líder**, quiero consultar hechos objetivos y su resolución, para separar condiciones de las acciones realizadas.

**Entrega:** R3 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-021, PHS-008 · **Decisiones pendientes:** D04

**Trazabilidad:** F3: EVENT_RULES, syncEngine; F2: Health Event · RN-15–17

**Datos / artefactos:** health_event

Criterios de aceptación:

1. Una condición accionable crea evento con origen, severidad, fecha, regla y episodio.
2. Dos ejecuciones concurrentes/reintentadas para la misma condición producen un único episodio abierto.
3. Persistencia mantiene episodio; resolución conserva historia; recurrencia posterior crea otro episodio.
4. Completar una tarea no resuelve un evento cuya condición sigue activa; el vínculo permite inspeccionar ambos.

**Estado (BIT-0024):** construida, en revisión. Se detectan hito vencido, mitigación vencida, riesgo materializado, desviación de proyecto y financiera, renovación próxima o vencida y cambio pendiente; con episodios, resolución y, por D04, causa y plan del PM validados por el líder. Límites: la detección ocurre al consultar el proyecto, no en segundo plano (PHS-033); faltan las condiciones que dependen del ciclo de revisión (PHS-020) y la prueba de dos ejecuciones simultáneas.

### PHS-031 — Generar acciones automáticas

Como **PM**, quiero recibir trabajo con dueño y plazo al surgir una condición, para convertir alertas en intervención.

**Entrega:** R3 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-030, PHS-032 · **Decisiones pendientes:** D04

**Trazabilidad:** F3: autoTaskFor; F1: autoActions · RN-15, RN-16

**Datos / artefactos:** health_task, health_event

Criterios de aceptación:

1. Cada regla habilitada asigna título, dueño con acceso, prioridad y plazo conforme política; se conserva regla y evento origen.
2. Reintentos generan una sola tarea para la clave de automatización del episodio.
3. Con autoTasks desactivado se conserva alerta y siguiente paso manual según D04; no desaparece el problema.
4. Acción vencida escala su propio seguimiento; no crea una cadena infinita de nuevas acciones.

**Estado (BIT-0024):** construida en parte, en revisión. Cumple los criterios 1 y 2 con la regla del prototipo (D04) y cierra sola la acción automática cuando desaparece la causa. Falta: pantalla para desactivar las acciones automáticas por proyecto (el servicio ya respeta `review_policy.auto_tasks`) y el escalamiento de acciones vencidas (criterio 4); hoy solo se marcan como vencidas.

### PHS-032 — Gestionar tareas manuales y seguimiento

Como **responsable de acción**, quiero actualizar mi trabajo hasta su cierre, para mantener compromiso y evidencia de resolución.

**Entrega:** R3 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-009, PHS-008, PHS-017 · **Decisiones pendientes:** D04

**Trazabilidad:** F3: createTask, saveTaskUpdate · RN-12, RN-15, RN-19

**Datos / artefactos:** health_task, activity, evidence

Criterios de aceptación:

1. Alta manual requiere título, responsable con acceso, plazo y prioridad; puede vincularse a un evento del mismo proyecto.
2. Cambiar estado/dueño/plazo deja comentario y antes/después; la bandeja filtra por estado, responsable, proyecto y vencimiento.
3. Completar/cancelar exige fecha y comentario, más soporte si política aplica; reabrir sigue D04 y conserva cierre previo.
4. Cerrar tarea no borra condición origen; un usuario sin acceso no puede actualizarla aunque sea dueño de otra tarea.

**Estado (BIT-0024):** construida en parte, en revisión. Alta manual, cambios de estado con comentario, bandeja "Mis acciones" y permisos. Falta: cambiar responsable o plazo, filtros de la bandeja, reabrir una acción cerrada, evidencia en acciones y vincular la acción manual a un evento desde la pantalla (la API lo admite).

### PHS-033 — Ejecutar evaluación y vencimientos en segundo plano

Como **operación**, quiero procesar compromisos sin sesiones abiertas, para mantener alertas y salud actualizadas.

**Entrega:** R3 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-026, PHS-030, PHS-031, PHS-008 · **Decisiones pendientes:** D03, D06, D08

**Trazabilidad:** F3: render/advance frente a A1: scheduler · RN-16, RN-17, NF-03, NF-08

**Datos / artefactos:** outbox_message, motor, eventos y tareas

Criterios de aceptación:

1. Con navegadores cerrados, cruzar una fecha en reloj de prueba genera los eventos/evaluaciones esperados.
2. Worker procesa trabajos con exclusión, reintentos y recuperación tras caída; no pierde trabajo entre commit y procesamiento.
3. Se miden plazos NF-03 con zona/calendario acordados; la UI puede conocer un cálculo pendiente o fallido.
4. Cambios mientras se calcula invalidan publicación obsoleta; reconciliación recupera un trabajo omitido sin duplicar efectos.

**Estado (BIT-0026):** construida en parte, en revisión. Salud recorre cada cinco minutos (configurable) los proyectos no cerrados: detecta alertas, crea o cierra acciones automáticas y guarda la evaluación, sin nadie conectado; una sola pasada a la vez aunque haya varias instancias; un proyecto que falla se registra y se reintenta en la siguiente; la pantalla de salud muestra la última pasada; el detalle de las pasadas se conserva tres meses y lo anterior queda resumido por día (BIT-0027). Falta: despacho del outbox y notificaciones (Plataforma, PHS-034), medición de los plazos NF-03 y una prueba con reloj simulado (la prueba cruza la fecha con datos, no con reloj).

### PHS-034 — Consultar alertas y notificaciones internas

Como **usuario**, quiero priorizar condiciones que requieren atención, para actuar desde mi bandeja.

**Entrega:** R4 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-030, PHS-031, PHS-033, PHS-006 · **Decisiones pendientes:** D04

**Trazabilidad:** F3: alerts, renderBell; F1: priorities · RN-15–18

**Datos / artefactos:** health_event, notification_delivery, outbox_message

Criterios de aceptación:

1. La bandeja ordena por criticidad y después vencimiento según contrato, con proyecto, dueño y enlace al origen.
2. La campana y los conteos solo incluyen alcance autorizado; marcar leído no resuelve evento ni tarea.
3. Una entrega repetida del mismo evento/destinatario/canal no crea notificaciones duplicadas.
4. Se distinguen alertas informativas, accionables y ya atendidas según D04; fallos de entrega pueden reintentarse.

**Estado (BIT-0028):** construida, en revisión. Plataforma convierte cada 30 segundos lo publicado por los servicios en notificaciones dentro de la aplicación: alertas (al responsable de la acción y al PM; al líder si es crítica), revisiones por validar, devueltas o validadas, y cambios propuestos o decididos. La bandeja ordena por lo que requiere acción, criticidad y plazo, con proyecto, responsable y botón para abrir el origen; el contador solo incluye proyectos que el usuario puede ver; leer no resuelve nada; una entrega repetida no duplica; un mensaje que falla se reintenta. Límites: sin correo ni otros canales (PHS-044); el botón abre la pestaña del proyecto, no el elemento; la bandeja muestra las 100 más recientes.


## E08 — Gobierno y consulta

### PHS-035 — Construir Health Center del PM

Como **PM**, quiero ver qué atender hoy, para organizar la operación de mis proyectos.

**Entrega:** R4 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-023, PHS-026, PHS-032, PHS-034 · **Decisiones pendientes:** D05

**Trazabilidad:** F3: views.center; F1: pmView · RN-18, RN-20

**Datos / artefactos:** Consultas autorizadas de proyectos, ciclos y acciones

Criterios de aceptación:

1. El inicio muestra revisiones pendientes, acciones vencidas, hitos y riesgos próximos con acceso directo al trabajo.
2. Cambiar selección de proyecto preserva contexto sin mezclar borradores ni datos.
3. Sin proyectos muestra vacío útil; un fallo parcial no presenta conteos incompletos como completos.
4. Se valida que todas las tarjetas respetan permisos y que una acción relevante puede abrirse sin buscarla en otra pantalla.

**Estado (BIT-0028):** construida, en revisión. "Inicio" es la primera pantalla: revisión vencida, por vencer o devuelta, alertas críticas sin causa y plan, acciones a cargo del usuario, e hitos y mitigaciones de los próximos 7 días, cada uno con "Abrir" hacia su pestaña; vacío útil sin proyectos y aviso cuando el panorama es parcial. Del criterio 2, el borrador de revisión se conserva por proyecto y usuario; no hay selector de proyecto en el inicio.

### PHS-036 — Construir Health Center del líder

Como **líder**, quiero identificar dónde intervenir, para priorizar apoyo y decisiones.

**Entrega:** R4 · **Prioridad:** P1 · **Tamaño orientativo:** M

**Dependencias:** PHS-024, PHS-027, PHS-034 · **Decisiones pendientes:** D05

**Trazabilidad:** F3: views.center/validation; F1: leadView · RN-08, RN-18

**Datos / artefactos:** Consultas de práctica, validaciones y eventos

Criterios de aceptación:

1. Se muestran proyectos en riesgo/atención, revisiones vencidas, baja confianza y decisiones pendientes de su alcance.
2. Cada foco explica el motivo y abre proyecto, revisión, cambio o acción pertinente.
3. Filtrar por práctica o responsable actualiza lista y conteos consistentemente; ausencia de evaluaciones no se clasifica como saludable.

**Estado (BIT-0028):** construida, en revisión. La misma pantalla "Inicio" muestra a quien decide o gobierna los proyectos en riesgo o en atención, confianza baja, revisiones vencidas y lo que espera su decisión (revisiones, cambios, causas y planes), con el motivo y acceso directo; filtros por práctica y PM que actualizan lista, focos y conteos. Dirección ve el estado sin decisiones que no le corresponden. Límite: un proyecto casi sin datos puede obtener score por la sola dimensión de equipo; se marca con confianza baja, no como sano sin más.

### PHS-037 — Construir portafolio y vista de Dirección

Como **director**, quiero comparar salud y exposición del portafolio, para tomar decisiones con cobertura conocida.

**Entrega:** R4 · **Prioridad:** P1 · **Tamaño orientativo:** M

**Dependencias:** PHS-026, PHS-027, PHS-028, PHS-014, PHS-006 · **Decisiones pendientes:** D05, D10

**Trazabilidad:** F3: portfolioStats, views.portfolio; F1: directionView/portfolio · RN-01, RN-18

**Datos / artefactos:** Consultas de evaluaciones, finanzas y clientes

Criterios de aceptación:

1. Tarjetas y tabla filtran por cliente, tipo, líder, estado y salud sobre el mismo conjunto autorizado.
2. Indicadores muestran número de proyectos, cobertura de evaluación, frescura, confianza y distribución de salud.
3. Promedio/exposición aplican D10; no suman monedas distintas ni convierten score desconocido en cero.
4. Cada agregado permite inspeccionar sus proyectos incluidos; evaluaciones provisionales y cerrados se tratan conforme política visible.

**Estado (BIT-0031):** construida, en revisión, con las reglas de D10. Pantalla "Portafolio": filtros por cliente, tipo, líder, estado y salud que cambian a la vez tarjetas y tabla; salud promedio simple con cuántos proyectos entran, distribución por semáforo (cada tarjeta filtra la tabla a sus proyectos), confianza, actualidad de las revisiones y exposición por moneda; planeados, pausados y cerrados aparecen marcados como "no cuenta". Límites: las tarjetas de confianza, actualidad y exposición no filtran la tabla; no hay exportación; el rendimiento con muchos proyectos no se ha medido.

### PHS-038 — Consultar timeline e historial completo

Como **usuario autorizado**, quiero reconstruir compromisos y decisiones, para entender cómo evolucionó un proyecto.

**Entrega:** R4 · **Prioridad:** P1 · **Tamaño orientativo:** M

**Dependencias:** PHS-019, PHS-024, PHS-030, PHS-032, PHS-008 · **Decisiones pendientes:** D07

**Trazabilidad:** F3: views.timeline/history; F2: Health History · RN-17, RN-19

**Datos / artefactos:** activity, audit_entry, evaluaciones, baselines y compromisos

Criterios de aceptación:

1. Timeline distingue pasado, presente y futuro con horizonte por ciclos y enlaces a entidades autorizadas.
2. Historial combina cambios, revisiones, riesgos, hitos, acciones y evaluaciones con autor, fecha, motivo y valores pertinentes.
3. Paginación conserva orden determinista y filtros por tipo/fecha; no recorta a 40/200 registros como el prototipo.
4. Puede reconstruirse qué baseline y reglas explicaban una evaluación anterior; retención aplica D07 sin eliminar referencias necesarias.

**Estado (BIT-0030):** construida en parte, en revisión. Pestaña "Historial" del proyecto: línea de tiempo con pasado (60 días), vencido hoy y futuro hasta el horizonte de ciclos, con acceso a cada pestaña; historial que combina lo auditado por todos los servicios, las alertas y la evaluación oficial de cada ciclo (con su línea base y sus reglas), con autor, fecha y motivo, filtros por tipo y fechas, y paginación estable sin tope. Falta: la retención (D07 sigue abierta), el enlace al elemento exacto y el detalle de valores antes y después de cada edición (se muestra el motivo y los datos principales).

### PHS-039 — Publicar ayuda y modelo PHF

Como **usuario**, quiero consultar definiciones y reglas desde la aplicación, para interpretar correctamente los indicadores.

**Entrega:** R4 · **Prioridad:** P1 · **Tamaño orientativo:** S

**Dependencias:** PHS-002, PHS-026 · **Decisiones pendientes:** Ninguna específica

**Trazabilidad:** F1; F3: PHF_CATALOG, PHF_FLOW, openDefinition · RN-03–10

**Datos / artefactos:** Documentación y rule_set

Criterios de aceptación:

1. La pantalla conserva el flujo de once etapas y un inventario verificado de elementos de F1/F3 con definición, propósito y aplicación.
2. Los indicadores enlazan a explicación de la versión vigente y señalan reglas candidatas frente a aprobadas.
3. La ayuda es navegable por teclado y coincide con el comportamiento implementado; no afirma capacidades pospuestas.

**Estado (BIT-0030):** construida en parte, en revisión. Pantalla "Modelo PHF": las once etapas del prototipo con el lugar de cada una en la aplicación, las reglas vigentes leídas del motor (pesos, topes, umbrales, semáforo, tendencia y proyección) y las 66 definiciones del catálogo del prototipo. Falta: el catálogo se copió del prototipo y solo cinco entradas llevan nota de lo que esta versión hace distinto; no se verificó entrada por entrada contra lo implementado, ni se probó la navegación por teclado. Los indicadores de otras pantallas no enlazan todavía a su definición.


### PHS-046 — Consultar proyectos pausados y cerrados

Como **líder o Dirección**, quiero ver en un solo lugar los proyectos pausados y cerrados con su motivo, para dar seguimiento a los que llevan tiempo detenidos.

**Entrega:** R4 · **Prioridad:** P1 · **Tamaño orientativo:** S

**Dependencias:** PHS-014, PHS-006 · **Decisiones pendientes:** D08

**Trazabilidad:** Pedida por el usuario el 2026-10-05 (BIT-0025); no existe en el prototipo · RN-01, RN-18

**Datos / artefactos:** project, project_status_log

Criterios de aceptación:

1. La consulta lista los proyectos pausados y cerrados del alcance del usuario con cliente, PM, fecha y motivo del cambio de estado y días transcurridos.
2. Distingue los que superan 30 días sin justificación registrada (D08) y muestra la última justificación de los demás.
3. Indica qué quedó detenido: revisiones sin programar, acciones y riesgos abiertos al momento de pausar o cerrar.
4. Se puede filtrar por práctica, estado y antigüedad, y abrir el proyecto desde cada renglón.

**Estado (BIT-0030):** construida, en revisión. Pantalla "Pausados y cerrados": proyectos del alcance del usuario con cliente, PM, fecha, motivo, días transcurridos, quién lo cambió, si deben la justificación de D08 y la última registrada, y lo que quedó abierto (hitos, riesgos, acciones, renovaciones y revisiones sin programar); filtros por estado, práctica y antigüedad, y acceso al proyecto.

## E09 — Calidad y operación

### PHS-040 — Validar el recorrido integral con escenarios

Como **equipo de calidad**, quiero probar el flujo completo y sus excepciones, para liberar una aplicación coherente.

**Entrega:** R5 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-019, PHS-024, PHS-027, PHS-028, PHS-029, PHS-033, PHS-035, PHS-036, PHS-037, PHS-038, PHS-039 · **Decisiones pendientes:** Ninguna específica

**Trazabilidad:** F4: guion; F3: loadDemo y fecha operativa · RN-01–20, NF-09

**Datos / artefactos:** Fixtures sintéticos y pruebas E2E

**Estado (BIT-0032): en revisión, no aceptada.** Existe un recorrido reproducible por el gateway sobre `phs_e2e`; aprobó 8 de 10 escenarios y documentó reinicio, scheduler y outbox. Bloquean la aceptación: un ciclo futuro queda habilitado para envío y DEMO-002 ya no representa el fixture saludable. Faltan además los casos E2E y pruebas de piloto detallados en [el informe del 2026-10-05](../pruebas/INFORME-E2E-2026-10-05.md).

Criterios de aceptación:

1. Los tres escenarios de F4 tienen fixtures repetibles: proyecto en riesgo, saludable con renovación y sin revisión.
2. El recorrido cubre alta, baseline, operación, review, devolución/reenvío, evento, acción, aprobación y comparación histórica con resultados esperados.
3. Casos negativos incluyen permisos cruzados, falta de soporte, conflicto, doble envío, cambio concurrente y caída/reintento de worker.
4. Simulación temporal y reinicio de fixtures están ausentes o inaccesibles en producción; no hay botón para borrar datos reales.

### PHS-041 — Verificar usabilidad, accesibilidad y rendimiento

Como **dueño de producto**, quiero medir calidad con usuarios y carga representativa, para comprobar que el MVP es utilizable.

**Entrega:** R5 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-035, PHS-036, PHS-037, PHS-040 · **Decisiones pendientes:** D06, D07

**Trazabilidad:** F1: oneMinute; ESPECIFICACION.md: NF · NF-01, NF-02, NF-03, NF-06

**Datos / artefactos:** Resultados de piloto y métricas

Criterios de aceptación:

1. El ensayo declara usuarios, volumen, concurrencia y entorno; reporta p95 de listas/portafolio contra NF-02.
2. Al menos 10 revisiones normales representativas registran duración activa y p90; incidentes se reportan por separado.
3. Se recorre con teclado y a 375 px alta, review y tareas, verificando foco, etiquetas, errores y semáforos con texto.
4. Incumplimientos generan trabajo concreto y se resuelven o acuerdan explícitamente antes de liberar; no se declara éxito solo por ejecutar la prueba.

### PHS-042 — Preparar operación y liberar piloto

Como **operación**, quiero desplegar y recuperar el sistema, para mantener un servicio administrable.

**Entrega:** R5 · **Prioridad:** P0 · **Tamaño orientativo:** M

**Dependencias:** PHS-040, PHS-041 · **Decisiones pendientes:** D06, D07, D09

**Trazabilidad:** A1: operación; A2: despliegue · NF-04, NF-07–10

**Datos / artefactos:** Despliegue, roles DB, backup, monitorización

Criterios de aceptación:

1. Existen entornos separados, secretos fuera del repositorio, rol runtime sin DDL/TRUNCATE y procedimiento de migración.
2. Se restaura una copia en entorno aislado y se comprueba integridad de datos y evidencias dentro de RPO/RTO acordados.
3. Un fallo de worker o backup produce señal observable con procedimiento de recuperación y responsable definido.
4. La liberación registra versión de aplicación/reglas, usuarios piloto, capacitación y criterios de salida; no quedan decisiones bloqueantes de MVP abiertas.


## E10 — Evolución posterior

### PHS-043 — Importar datos del prototipo

Como **PM**, quiero migrar datos locales existentes, para evitar recapturar un piloto.

**Entrega:** POST · **Prioridad:** P2 · **Tamaño orientativo:** M

**Dependencias:** PHS-009, PHS-011, PHS-040 · **Decisiones pendientes:** Ninguna específica

**Trazabilidad:** F4: localStorage; propuesta posterior · RN-19

**Datos / artefactos:** Mapeo de estado phs_state_v5 a entidades

Criterios de aceptación:

1. Antes de implementar se confirma que existen datos reales y se define exportación autorizada desde navegador.
2. La importación ofrece validación previa, mapeo de responsables y reporte de errores; no presupone que nombres son identidades.
3. Reintento no duplica entidades y cada dato importado conserva procedencia; evidencia corrupta se informa.

### PHS-044 — Integrar notificaciones y herramientas externas

Como **dueño de producto**, quiero conectar canales y fuentes priorizados, para reducir captura y mejorar seguimiento.

**Entrega:** POST · **Prioridad:** P2 · **Tamaño orientativo:** L

**Dependencias:** PHS-034, PHS-042 · **Decisiones pendientes:** Ninguna específica

**Trazabilidad:** F1: principleAutomate; propuesta posterior · NF-04, NF-05

**Datos / artefactos:** Adaptadores externos

Criterios de aceptación:

1. La integración se divide en historias por proveedor/caso con alcance, permisos y dueño del dato antes de desarrollo.
2. Se especifican idempotencia, sincronización, reintentos y resolución de conflicto; una caída externa no bloquea operación local.
3. Correo u otro canal se activa solo con configuración y destinatarios autorizados; no se envían pruebas a usuarios reales sin autorización.

### PHS-045 — Explorar asistencia inteligente

Como **dueño PHF**, quiero evaluar IA sobre historia suficiente, para determinar si mejora la anticipación.

**Entrega:** POST · **Prioridad:** P2 · **Tamaño orientativo:** L

**Dependencias:** PHS-042 · **Decisiones pendientes:** Ninguna específica

**Trazabilidad:** F1: forecast difiere IA; propuesta posterior · RN-10, NF-04

**Datos / artefactos:** Experimento posterior, sin cambio al motor oficial

Criterios de aceptación:

1. Antes de construir se define hipótesis, datos autorizados y comparación con forecast determinista.
2. El experimento tiene métrica de utilidad y evaluación de errores; no cambia scores oficiales ni aprueba decisiones automáticamente.
3. El resultado puede ser no adoptar IA; no es requisito de salida del MVP.

## Preparación y terminación comunes

**Lista para desarrollo:** objetivo entendido, decisiones bloqueantes de su alcance cerradas, ejemplo normal y de error, permisos, contrato de datos/API y dependencias disponibles o interfaz acordada. Estimación y responsable se asignan con el equipo; no se inventan aquí.

**Terminada:** criterios demostrados, flujo UI/API/datos integrado según alcance, permisos y errores probados, migración cuando corresponda, auditoría/concurrencia verificadas, documentación actualizada y revisión técnica. La evidencia de aceptación se vincula al ID. No basta tener una pantalla o una tabla.

Los tests se centran en reglas, permisos, transacciones y riesgos reales. No se exige replicar cada línea de implementación. Ninguna historia autoriza publicar, enviar mensajes externos o alterar datos de producción sin el despliegue acordado.
