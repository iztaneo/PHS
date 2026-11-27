# Backlog del MVP funcional

Generado por `scripts/backlog-mvp.py` a partir del export de Jira [fuentes/PHS-Jira-import-completo.csv](fuentes/PHS-Jira-import-completo.csv), recibido el 2026-11-26. **No se edita a mano**: el estado y el incremento de cada pieza están en el script.

Este backlog sustituye a [BACKLOG.md](BACKLOG.md) como referencia de trabajo (BIT-0043). Las decisiones que lo enmarcan están en [DECISIONES.md](DECISIONES.md), sección "Nuevo backlog (2026-11-26)".

**128 piezas** en 14 épicas: 40 parcial, 29 nuevo, 26 hecho, 17 cambia, 8 fuera, 8 pospuesto.

| Estado | Significado |
| --- | --- |
| Hecho | Lo construido lo cubre; puede requerir ajustes menores. Nada está aceptado todavía. |
| Parcial | Existe una parte. |
| Nuevo | No existe. |
| Cambia | Existe, pero el nuevo backlog pide otro comportamiento; manda el nuevo backlog. |
| Fuera | Infraestructura de Azure: fuera del MVP funcional por decisión del usuario. |
| Pospuesto | Funcional, pero se hará después del MVP por decisión del usuario. |

## Incrementos del MVP funcional

| Incremento | Contenido | Piezas |
| --- | --- | --- |
| I1 | Usuarios y sesiones | 11: AUT-05, AUT-06, USR-01, USR-02, USR-03, USR-04, USR-05, USR-06, USR-07, USR-08, USR-09 |
| I2 | Roles, permisos y menú configurables | 11: RBA-01, RBA-02, RBA-03, RBA-04, RBA-05, RBA-06, RBA-07, RBA-08, RBA-09, RBA-10, HC-08 |
| I3 | Catálogos y parámetros del PHF | 10: CAT-01, CAT-02, CAT-03, CAT-04, CAT-05, CAT-06, CAT-07, CAT-08, CAT-09, HLT-08 |
| I4 | Clientes, proyectos y línea base con aprobación | 17: CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06, CLI-07, CLI-08, PRJ-01, PRJ-02, PRJ-03, PRJ-04, PRJ-05, PRJ-06, PRJ-07, PRJ-08, PRJ-09 |
| I5 | Hitos, riesgos, revisiones y salud | 25: HYR-01, HYR-02, HYR-03, HYR-04, HYR-05, HYR-06, HYR-07, HYR-08, HYR-09, HYR-10, REV-01, REV-02, REV-03, REV-04, REV-05, REV-06, REV-07, REV-08, HLT-01, HLT-02, HLT-03, HLT-04, HLT-05, HLT-06, HLT-07 |
| I6 | Alertas, reloj simulado, acciones y cambios | 26: PLT-06, PLT-10, EXP-01, EXP-02, EXP-03, EXP-04, EXP-05, EXP-06, EXP-07, EXP-08, TSK-01, TSK-02, TSK-03, TSK-04, TSK-05, TSK-06, TSK-07, TSK-08, CHG-01, CHG-02, CHG-03, CHG-04, CHG-05, CHG-06, CHG-07, CHG-08 |
| I7 | Health Center, historial y auditoría | 10: PLT-12, REV-09, HC-01, HC-02, HC-03, HC-04, HC-05, HC-06, HC-07, HC-09 |

Se conservan además, aunque el nuevo backlog no los menciona: causa y plan validados por el líder (D04), portafolio de Dirección (D10), pausados y cerrados con justificación a 30 días (D08), días festivos, renovaciones, economía y la ayuda del modelo PHF.

## E01 Plataforma técnica

Base técnica del PHS: infraestructura Azure con Bicep, librería phs-platform con puertos e inyección de dependencias, mensajería por IMessageBus (Service Bus hoy), outbox, conectores de datos, observabilidad OpenTelemetry, auditoría transversal y pipeline CI/CD. Todo componente se consume por interfaz y es sustituible implementando el puerto.

| Pieza | Tipo | Prioridad | Estado | Incremento | Nota |
| --- | --- | --- | --- | --- | --- |
| PLT-01 Infraestructura base con Bicep por ambiente | Tarea | Highest | Fuera | — | Infraestructura Azure con Bicep. |
| PLT-02 Perímetro: Front Door, WAF, App Service y APIM | Tarea | Highest | Fuera | — | Front Door, WAF, App Service y APIM. Hoy el gateway cumple el papel de entrada única. |
| PLT-03 Clúster AKS, ACR y workload identity | Tarea | Highest | Fuera | — | AKS y ACR. Hoy: procesos locales y Docker. |
| PLT-04 Bases de datos, Blob y Redis con private endpoints | Tarea | Highest | Fuera | — | Servicios administrados de Azure. |
| PLT-05 Librería phs-platform: puertos e inyección de dependencias | Tarea | Highest | Fuera | — | Librería de puertos con implementaciones intercambiables. Se pospone con el cambio de tecnologías. |
| PLT-06 Configuración por capas y feature flags | Tarea | High | Parcial | I6 | Configuración por variables de entorno. Del MVP solo se necesitan los interruptores de reloj simulado y reinicio de ambiente. |
| PLT-07 Azure Service Bus y conector IMessageBus | Tarea | Highest | Fuera | — | Azure Service Bus. Hoy el outbox lo despacha Plataforma. |
| PLT-08 Transactional outbox y relay | Tarea | High | Hecho | — | Outbox en PostgreSQL con despacho y reintentos (BIT-0028). |
| PLT-09 Conectores de datos: PostgreSQL, Mongo, Blob, Redis | Tarea | High | Fuera | — | Conectores de Azure. Hoy PostgreSQL y carpeta local. |
| PLT-10 Conector de correo y reloj del sistema | Tarea | Medium | Nuevo | I6 | Reloj del sistema simulable para el MVP. El envío de correo se hace con un buzón de prueba local cuando lo pidan los avisos de usuarios. |
| PLT-11 Observabilidad con OpenTelemetry y Azure Monitor | Tarea | High | Fuera | — | OpenTelemetry y Azure Monitor. |
| PLT-12 Auditoría transversal de escrituras | Tarea | High | Parcial | I7 | Auditoría en la misma transacción en todos los servicios. Faltan rol, IP de origen, enmascarado declarado y la consulta (HC-06). |
| PLT-13 Pipeline CI/CD con GitHub Actions y OIDC | Tarea | Highest | Parcial | — | CI en GitHub Actions con compilación, pruebas, e2e y Docker. El despliegue queda fuera del MVP. |

## E02 Autenticación OTP

Servicio Identity del PHS: acceso sin contraseña con código de un solo uso enviado por correo, bloqueo por intentos, token de identidad ES256 de 15 minutos sin roles y refresh token de 8 horas con rotación. El canal de entrega se abstrae en IOtpChannel para incorporar SMS, WhatsApp o authenticator sin cambiar el flujo. La autorización (roles) es responsabilidad de la épica 3.

| Pieza | Tipo | Prioridad | Estado | Incremento | Nota |
| --- | --- | --- | --- | --- | --- |
| AUT-01 Solicitar código de acceso con mi correo | Historia | Highest | Pospuesto | — | Hoy se entra con contraseña. Pasa a código por correo con lista blanca de dominios. Pospuesto por decisión del usuario (BIT-0044): se conserva el acceso con contraseña. |
| AUT-02 Recibir el código por correo | Historia | Highest | Pospuesto | — | Acceso por código de un solo uso. Pospuesto por decisión del usuario (BIT-0044): se conserva el acceso con contraseña. |
| AUT-03 Verificar el código y entrar | Historia | Highest | Pospuesto | — | Acceso por código de un solo uso. Pospuesto por decisión del usuario (BIT-0044): se conserva el acceso con contraseña. |
| AUT-04 Reenviar el código | Historia | High | Pospuesto | — | Acceso por código de un solo uso. Pospuesto por decisión del usuario (BIT-0044): se conserva el acceso con contraseña. |
| AUT-05 Bloqueo por intentos fallidos | Historia | Highest | Hecho | I1 | Bloqueo por contraseñas fallidas; con el acceso por código pasará a códigos fallidos. Se agregan el desbloqueo por administrador y su correo. |
| AUT-06 Cerrar sesión y revocar sesiones | Historia | High | Parcial | I1 | Hay cierre de sesión con la sesión actual; falta cerrar todas las sesiones. |
| AUT-07 Puerto IOtpChannel y canal de correo | Tarea | Highest | Pospuesto | — | Canal de correo detrás de una interfaz. Pospuesto por decisión del usuario (BIT-0044): se conserva el acceso con contraseña. |
| AUT-08 Almacén de OTP con hash, vigencia y un solo uso | Tarea | Highest | Pospuesto | — | Acceso por código de un solo uso. Pospuesto por decisión del usuario (BIT-0044): se conserva el acceso con contraseña. |
| AUT-09 Emisión, rotación y validación de tokens | Tarea | Highest | Pospuesto | — | Hoy: cookie de sesión opaca validada por el gateway. Pasa a token de identidad y refresh con rotación. Pospuesto por decisión del usuario (BIT-0044): se conserva el acceso con contraseña. |
| AUT-10 Pantallas de acceso en la SPA | Historia | High | Pospuesto | — | Pantalla de acceso en dos pasos. Pospuesto por decisión del usuario (BIT-0044): se conserva el acceso con contraseña. |

## E03 Autorización RBAC

Servicio Authorization del PHS: roles, permisos y asignaciones por ámbito (global, práctica, proyecto) como datos 100% configurables, token de acceso con roles por ámbito, menús dinámicos construidos desde los permisos, y puerto IAuthorizationClient para que los servicios verifiquen sin leer claims a mano. Los cuatro roles iniciales se siembran como datos editables.

| Pieza | Tipo | Prioridad | Estado | Incremento | Nota |
| --- | --- | --- | --- | --- | --- |
| RBA-01 Modelo de roles, permisos y ámbitos | Tarea | Highest | Cambia | I2 | Hoy las reglas de D05 están en el código. Pasan a roles, permisos y ámbitos como datos. |
| RBA-02 Administrar roles y sus permisos | Historia | Highest | Nuevo | I2 |  |
| RBA-03 Asignar roles a usuarios por ámbito | Historia | Highest | Cambia | I2 | Hoy: roles pm, lead y director por práctica. |
| RBA-04 Definir el menú y ligarlo a permisos | Historia | High | Nuevo | I2 |  |
| RBA-05 Ver solo el menú que me corresponde | Historia | High | Cambia | I2 | Hoy el menú es fijo. |
| RBA-06 Consultar quién tiene acceso a qué | Historia | Medium | Nuevo | I2 |  |
| RBA-07 Token de acceso con roles por ámbito | Tarea | Highest | Nuevo | I2 |  |
| RBA-08 Puerto IAuthorizationClient y verificación en servicios | Tarea | Highest | Cambia | I2 | Hoy Salud y Plataforma preguntan a Proyectos. |
| RBA-09 Caché de decisiones e invalidación por eventos | Tarea | High | Nuevo | I2 | Caché en memoria; sin Redis. |
| RBA-10 Protección del administrador inicial y del rol de administración | Historia | High | Nuevo | I2 |  |

## E04 Usuarios

ABC de cuentas del PHS: alta por administrador, edición, baja lógica y reactivación (nunca borrado físico), desbloqueo y revocación de sesiones, ficha con roles e historial, y puerto IUserDirectory para que Identity y los demás servicios consulten usuarios sin acoplarse al esquema. El correo es la identidad única e inmutable de la cuenta.

| Pieza | Tipo | Prioridad | Estado | Incremento | Nota |
| --- | --- | --- | --- | --- | --- |
| USR-01 Dar de alta un usuario | Historia | Highest | Parcial | I1 | Hoy: alta con correo y nombre. Faltan apellidos, puesto, práctica y lista blanca. |
| USR-02 Buscar y listar usuarios | Historia | High | Parcial | I1 | Hay lista; faltan filtros y paginación. |
| USR-03 Editar los datos de un usuario | Historia | High | Parcial | I1 | Falta historial por campo y control de versión. |
| USR-04 Desactivar y reactivar un usuario | Historia | Highest | Parcial | I1 | Hay desactivar y reactivar; faltan motivo, advertencia de proyectos y asignaciones suspendidas. |
| USR-05 Desbloquear y cerrar sesiones de un usuario | Historia | High | Parcial | I1 | Hay restablecer contraseña; faltan desbloquear y cerrar sesiones. |
| USR-06 Ver la ficha completa con roles e historial | Historia | High | Nuevo | I1 |  |
| USR-07 Editar mi propio perfil | Historia | Medium | Nuevo | I1 |  |
| USR-08 Modelo de usuarios y puerto IUserDirectory | Tarea | Highest | Parcial | I1 | Tabla de usuarios existente; faltan campos, historial y versión. |
| USR-09 Correo de bienvenida y eventos de usuario | Tarea | Medium | Nuevo | I1 |  |

## E05 Catálogos y configuración del PHF

Catálogos maestros (prácticas, periodicidades de revisión, severidades, categorías de riesgo, criticidades de hito, motivos de cambio) y parámetros numéricos del PHF (umbrales de desviación, ventanas de anticipación, tolerancias) editables desde la interfaz, versionados y auditados. Puerto ICatalogProvider con caché e invalidación por eventos. El PHF se configura, no se programa.

| Pieza | Tipo | Prioridad | Estado | Incremento | Nota |
| --- | --- | --- | --- | --- | --- |
| CAT-01 Administrar el catálogo de prácticas | Historia | Highest | Parcial | I3 | Hay prácticas; faltan líder y desactivación. |
| CAT-02 Administrar periodicidades de revisión | Historia | Highest | Cambia | I3 | Hoy cadencia fija semanal, quincenal o mensual por calendario (D03). Pasa a catálogo; mensual = 30 días. |
| CAT-03 Administrar severidades, categorías de riesgo, criticidades y motivos de cambio | Historia | High | Cambia | I3 | Hoy listas fijas en la base. El hito pasa de "crítico sí/no" a criticidad de cuatro niveles. |
| CAT-04 Configurar los parámetros numéricos del PHF | Historia | Highest | Cambia | I3 | Hoy constantes del motor (reglas phf-v1). Pasan a parámetros editables y versionados. |
| CAT-05 Consultar el historial de cambios de configuración | Historia | Medium | Nuevo | I3 |  |
| CAT-06 Modelo de catálogos y parámetros versionados | Tarea | Highest | Nuevo | I3 |  |
| CAT-07 Puerto ICatalogProvider con caché e invalidación | Tarea | Highest | Nuevo | I3 | Sin Redis: caché en memoria. |
| CAT-08 Semilla inicial con los valores del documento maestro | Tarea | High | Nuevo | I3 |  |
| CAT-09 Administrar catálogos de estados, tipos de iniciativa, roles de equipo y estatus de contrato | Historia | High | Cambia | I3 | Hoy los estados son fijos (por ejemplo proyecto planned, active, paused, renewing, closed). Pasan a catálogo con inicial y terminales. |

## E06 Clientes y contactos

Cliente y contactos como entidades maestras de Project Core, matriz de escalación por cliente y estatus básico de contrato. Un contacto siempre nace en el catálogo del cliente; el proyecto solo lo vincula. Baja lógica en todo, eventos clients.* y auditoría conforme a PLT-12. Prerrequisito de la épica 07.

| Pieza | Tipo | Prioridad | Estado | Incremento | Nota |
| --- | --- | --- | --- | --- | --- |
| CLI-01 Dar de alta y editar un cliente | Historia | Highest | Parcial | I4 | Hoy el cliente es solo un nombre. |
| CLI-02 Buscar y listar clientes | Historia | High | Parcial | I4 |  |
| CLI-03 Administrar los contactos de un cliente | Historia | Highest | Nuevo | I4 | Hoy el contacto es un texto en el proyecto. |
| CLI-04 Definir la matriz de escalación del cliente | Historia | High | Nuevo | I4 |  |
| CLI-05 Consultar la ficha del cliente con su historial | Historia | Medium | Nuevo | I4 |  |
| CLI-06 Modelo de clientes, contactos y escalación | Tarea | Highest | Nuevo | I4 |  |
| CLI-07 Puerto IClientDirectory con caché | Tarea | Highest | Nuevo | I4 |  |
| CLI-08 Eventos clients.* y desactivación lógica | Tarea | High | Nuevo | I4 |  |

## E07 Proyectos y baseline

Alta de proyectos ligados a cliente y práctica, equipo, contactos y matriz de escalación heredada, baseline en borrador aprobada por el líder de práctica y congelada como versión inmutable. Estados del proyecto desde catálogo, puerto IProjectDirectory y eventos projects.*.

| Pieza | Tipo | Prioridad | Estado | Incremento | Nota |
| --- | --- | --- | --- | --- | --- |
| PRJ-01 Dar de alta un proyecto | Historia | Highest | Parcial | I4 | Falta tipo de iniciativa; el creador recibe rol pm por proyecto. |
| PRJ-02 Administrar el equipo del proyecto | Historia | High | Parcial | I4 | Faltan rol del catálogo, fechas de asignación y diferencia contra lo comprometido. |
| PRJ-03 Vincular contactos y ajustar la matriz de escalación | Historia | High | Nuevo | I4 |  |
| PRJ-04 Definir la baseline inicial en borrador | Historia | Highest | Cambia | I4 | Hoy la línea base se publica directo. Pasa a borrador enviado a aprobación. |
| PRJ-05 Aprobar o devolver la baseline | Historia | Highest | Cambia | I4 | Nuevo: la aprueba el líder y nunca el mismo PM (sustituye la autoaprobación del piloto). |
| PRJ-06 Cambiar el estado del proyecto | Historia | High | Cambia | I4 | Hay estados con motivo (D08); pasan a catálogo y sin línea base no se ejecuta. |
| PRJ-07 Modelo de proyectos, equipo y versiones de baseline | Tarea | Highest | Parcial | I4 |  |
| PRJ-08 Puerto IProjectDirectory y eventos projects.* | Tarea | Highest | Parcial | I4 | Hay eventos de proyecto en el outbox. |
| PRJ-09 Consultar mis proyectos y la ficha del proyecto | Historia | High | Hecho | I4 | Lista y ficha existen; se ajustan a los nuevos campos. |

## E08 Hitos y riesgos

Hitos con fecha comprometida y pronosticada, cierre con evidencia ligera, riesgos con probabilidad e impacto en escala baja, media y alta, historial completo, materialización y matriz de exposición. Eventos milestones.* y risks.*.

| Pieza | Tipo | Prioridad | Estado | Incremento | Nota |
| --- | --- | --- | --- | --- | --- |
| HYR-01 Registrar hitos | Historia | Highest | Parcial | I5 | Falta criticidad de catálogo y forzar control de cambios tras la línea base. |
| HYR-02 Actualizar avance y fecha pronosticada de un hito | Historia | Highest | Hecho | I5 | Fecha comprometida y operativa (008). Falta el evento de desfase. |
| HYR-03 Cerrar un hito con evidencia | Historia | High | Cambia | I5 | Hoy cerrar pide comentario; pasa a exigir evidencia solo en imagen (sustituye D09 para el cierre). |
| HYR-04 Registrar riesgos | Historia | Highest | Hecho | I5 | Probabilidad e impacto 1 a 3; falta origen. |
| HYR-05 Actualizar un riesgo conservando su historial | Historia | Highest | Parcial | I5 | Hay historial; desde la pantalla solo cambian comentario y estado. |
| HYR-06 Materializar un riesgo | Historia | High | Parcial | I5 | Falta describir el impacto real y ofrecer la acción. |
| HYR-07 Ver la exposición de riesgos del proyecto | Historia | Medium | Nuevo | I5 | Matriz de exposición. |
| HYR-08 Modelo de hitos, riesgos e historial | Tarea | Highest | Hecho | I5 |  |
| HYR-09 Almacenamiento de evidencias | Tarea | High | Hecho | I5 | Evidencias en carpeta privada (D09). Sin Blob. |
| HYR-10 Eventos milestones.* y risks.* | Tarea | Highest | Parcial | I5 |  |

## E09 Revisiones

Health Review periódica y adaptativa por proyecto: ciclo configurable, calendario con IClock, formulario por dimensiones con compromisos precargados, bloqueo de sin novedades ante vencidos, evidencia, validación por el líder con versiones, vencidas y omitidas, y métrica de duración.

| Pieza | Tipo | Prioridad | Estado | Incremento | Nota |
| --- | --- | --- | --- | --- | --- |
| REV-01 Configurar el ciclo de revisión del proyecto | Historia | Highest | Cambia | I5 | Hoy cadencia fija; pasa a periodicidad del catálogo y validador por defecto. |
| REV-02 Ejecutar una Health Review rápida | Historia | Highest | Hecho | I5 | Health Review del prototipo (BIT-0025). |
| REV-03 Impedir sin novedades con compromisos vencidos | Historia | Highest | Hecho | I5 | "Nada cambió" bloqueado; se ajusta a "compromisos vencidos sin actualizar". |
| REV-04 Adjuntar evidencia y comentarios a la revisión | Historia | High | Cambia | I5 | Hoy el soporte obligatorio bloquea el envío; pasa a permitirlo y bajar la confianza. Imágenes PNG y JPG. |
| REV-05 Validar o pedir corrección como líder | Historia | Highest | Cambia | I5 | Hecho, salvo que el autor ya no podrá validar su propia revisión. |
| REV-06 Registrar revisiones vencidas y omitidas | Historia | High | Parcial | I5 | Hay revisión vencida; faltan omitidas y validación vencida. |
| REV-07 Modelo de ciclos, revisiones y versiones | Tarea | Highest | Hecho | I5 |  |
| REV-08 Programador de revisiones con IClock | Tarea | Highest | Parcial | I5 | Hay proceso programado; falta el reloj simulado. |
| REV-09 Métrica de duración de la revisión | Tarea | Medium | Parcial | I7 | Se registra la duración; falta el indicador. |

## E10 Evaluación de salud

Score de salud provisional detrás del puerto IHealthScorer, Health Gates, confianza separada del score, tendencia, recálculo por eventos, evaluación explicada, fotos inmutables y parámetros editables. Fórmula y umbrales son provisionales hasta cerrar el modelo de salud.

| Pieza | Tipo | Prioridad | Estado | Incremento | Nota |
| --- | --- | --- | --- | --- | --- |
| HLT-01 Puerto IHealthScorer y calculadora provisional | Tarea | Highest | Hecho | I5 | Motor phf-v1; se marcará como modelo provisional. |
| HLT-02 Health Gates | Tarea | Highest | Hecho | I5 | Se conservan las fórmulas actuales (decisión del usuario); sus valores pasan a parámetros. |
| HLT-03 Calcular la confianza de la información | Tarea | Highest | Hecho | I5 | Confianza explicada (BIT-0026). |
| HLT-04 Calcular la tendencia | Tarea | High | Hecho | I5 | Tendencia entre cortes de ciclo; se conserva la regla actual. |
| HLT-05 Recálculo automático por eventos | Tarea | Highest | Parcial | I5 | Hoy al consultar y cada 5 minutos, no por eventos. |
| HLT-06 Ver la evaluación explicada | Historia | Highest | Hecho | I5 | Falta la etiqueta de modelo provisional. |
| HLT-07 Guardar la foto de cada evaluación | Historia | Highest | Hecho | I5 | Evaluaciones inmutables en PostgreSQL. |
| HLT-08 Configurar los parámetros del modelo de salud | Historia | High | Nuevo | I3 | Pesos y umbrales editables. |

## E11 Motor de expectativas y alertas

Expectation Engine sobre compromisos registrados, Health Events tipificados e idempotentes que se cierran solos cuando desaparece la condición, campana de alertas en el portal, reglas contra repetición y fecha operativa simulada para pruebas.

| Pieza | Tipo | Prioridad | Estado | Incremento | Nota |
| --- | --- | --- | --- | --- | --- |
| EXP-01 Motor de expectativas | Tarea | Highest | Hecho | I6 | Detección de condiciones; faltan ventanas de anticipación. |
| EXP-02 Generar Health Events | Tarea | Highest | Parcial | I6 | Faltan eventos "por vencer" y de acción vencida. |
| EXP-03 Campana de alertas en el portal | Historia | Highest | Hecho | I6 | Bandeja y contador (BIT-0028); falta agrupar por proyecto. |
| EXP-04 Atender una alerta | Historia | Highest | Parcial | I6 | Falta crear la acción prellenada desde la notificación. |
| EXP-05 Evitar alertas repetitivas | Tarea | High | Parcial | I6 | Sin duplicados; faltan aviso al subir severidad y agrupación. |
| EXP-06 Simular la fecha operativa | Historia | High | Nuevo | I6 | Reloj simulado; cierra también AT-02. |
| EXP-07 Modelo de eventos y notificaciones | Tarea | Highest | Hecho | I6 |  |
| EXP-08 Entrega de notificaciones al portal | Tarea | Highest | Hecho | I6 |  |

## E12 Acciones correctivas

Health Tasks con responsable y fecha, creadas desde eventos o manualmente, con seguimiento por estados, bitácora, cierre con evidencia y detección de vencidas. Cerrar una acción no cierra su evento y viceversa.

| Pieza | Tipo | Prioridad | Estado | Incremento | Nota |
| --- | --- | --- | --- | --- | --- |
| TSK-01 Crear una acción desde un evento | Historia | Highest | Cambia | I6 | Hoy hay acción automática en cada alerta (D04); pasa a solo en las críticas, y crear desde alerta con formulario prellenado. |
| TSK-02 Crear una acción manual | Historia | High | Parcial | I6 | Falta vincular a hito, riesgo o revisión. |
| TSK-03 Dar seguimiento a una acción | Historia | Highest | Parcial | I6 | Faltan motivo de bloqueo y reasignar. |
| TSK-04 Cerrar una acción con evidencia | Historia | Highest | Parcial | I6 | Faltan imagen de cierre y reabrir. |
| TSK-05 Consultar mis acciones y las del proyecto | Historia | Highest | Parcial | I6 | Faltan filtros. |
| TSK-06 Detectar acciones vencidas | Tarea | High | Parcial | I6 | Se marcan vencidas; falta el evento. |
| TSK-07 Modelo de acciones y su bitácora | Tarea | Highest | Hecho | I6 |  |
| TSK-08 Eventos tasks.* y auditoría | Tarea | High | Parcial | I6 |  |

## E13 Control de cambios

Solicitud de cambios con motivo, justificación e impacto, comparativo contra la baseline vigente, aprobación o rechazo por el líder, baseline vN+1 inmutable en una sola transacción, consulta de versiones y recálculo de expectativas y salud.

| Pieza | Tipo | Prioridad | Estado | Incremento | Nota |
| --- | --- | --- | --- | --- | --- |
| CHG-01 Solicitar un control de cambios | Historia | Highest | Parcial | I6 | Faltan motivo de catálogo y agregar o eliminar hitos. |
| CHG-02 Ver el impacto contra la baseline vigente | Historia | Highest | Nuevo | I6 | Comparación lado a lado. |
| CHG-03 Aprobar o rechazar un cambio | Historia | Highest | Cambia | I6 | Hecho, salvo que quien solicita ya no podrá aprobar. |
| CHG-04 Generar la nueva versión de baseline | Tarea | Highest | Hecho | I6 |  |
| CHG-05 Consultar y comparar versiones de baseline | Historia | High | Parcial | I6 | Falta comparar versiones. |
| CHG-06 Recalcular expectativas y salud con la nueva baseline | Tarea | Highest | Hecho | I6 |  |
| CHG-07 Modelo de solicitudes de cambio | Tarea | Highest | Hecho | I6 |  |
| CHG-08 Cancelar una solicitud propia | Historia | Medium | Nuevo | I6 |  |

## E14 Health Center e historial

Experiencia de gobierno por rol: vista del PM completa, vista del líder básica con bandeja de validación, Health Timeline, historial del proyecto, consulta básica de auditoría, modelo de lectura por eventos, navegación por permisos y reinicio de ambientes de prueba.

| Pieza | Tipo | Prioridad | Estado | Incremento | Nota |
| --- | --- | --- | --- | --- | --- |
| HC-01 Vista del PM: qué atender hoy | Historia | Highest | Hecho | I7 | Inicio (BIT-0028). |
| HC-02 Vista del líder: dónde intervenir | Historia | Highest | Parcial | I7 | Faltan filtros de foco. |
| HC-03 Bandeja de validación de revisiones | Historia | Highest | Parcial | I7 | Hay revisiones por validar en Mis acciones; falta bandeja propia. |
| HC-04 Health Timeline del proyecto | Historia | High | Hecho | I7 | Línea de tiempo (BIT-0030). |
| HC-05 Historial del proyecto | Historia | High | Parcial | I7 | Hay historial; falta la gráfica de scores. |
| HC-06 Consulta básica de auditoría | Historia | Medium | Nuevo | I7 | Consulta de auditoría. |
| HC-07 Modelo de lectura y API del Health Center | Tarea | Highest | Parcial | I7 | Consulta directa, sin modelo de lectura por eventos. |
| HC-08 Navegación y vistas según permisos | Tarea | Highest | Nuevo | I2 | Se resuelve con el menú por permisos. |
| HC-09 Reinicio completo de ambientes de prueba | Tarea | High | Nuevo | I7 | Reinicio de ambiente de prueba. |
