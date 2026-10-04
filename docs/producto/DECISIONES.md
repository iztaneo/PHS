# Decisiones de producto y arquitectura pendientes

Las decisiones de negocio siguen **pendientes**, salvo las confirmaciones parciales de D05 y D06 registradas en [Decisiones confirmadas](#decisiones-confirmadas). D06 cuenta con una [propuesta tecnológica detallada](../STACK-TECNOLOGICO.md) y [ADR-001](../adr/001-stack-mvp.md); el stack y la identidad del MVP están confirmados, pero faltan infraestructura, volumen piloto y validación de integración. Las recomendaciones permiten preparar trabajo y pruebas, pero no representan aprobación del usuario. Responsable = función que debe resolver, no persona ya asignada. Las historias bloqueadas pueden investigarse, pero no aceptarse con una política inventada.

| ID | Decisión y discrepancia | Propuesta para resolver | Responsable | Afecta |
| --- | --- | --- | --- | --- |
| D01 | Fórmulas, unidades, pesos, severidad, redondeo, ausencia de datos, confianza y pronóstico. F1 declara umbrales sujetos a validación; F3 aporta coeficientes y aproximaciones. | Validar con casos de desarrollo y servicios recurrentes; versionar el conjunto. Desvío de avance en puntos porcentuales; no tratar presupuesto consumido como margen. | Dueño PHF + líder + finanzas | PHS-002, 025–029 |
| D02 | ¿Cuándo adquiere vigencia la revisión? F3 modifica datos antes de validación y calcula parte del snapshot antes del envío. También review vencida puede bloquear “nada cambió”. | Conservar operación observada y distinguir evaluación provisional/oficial; decidir efecto de devolución, aceptación y nuevo ciclo. Excluir el vencimiento del propio ciclo como bloqueo circular al enviarlo. | Dueño PHF + líder | PHS-020–024, 026, 028 |
| D03 | Mensual=30 días en F3; semanas/quincenas y fines de mes, festivos, zona y próxima fecha tras revisión tardía. | Semanal 7 días, quincenal 14; mensual por calendario con ajuste al último día válido; declarar días naturales/laborales y anclaje de ciclos. | Dueño PHF | PHS-020, 021, 029, 033 |
| D04 | F3 cierra automáticamente tareas al desaparecer condición; F1 pide cierre validado. Definir alertas accionables, plazos, recurrencia y autoTasks desactivado. | Resolver evento sin completar tarea; comentario de cierre. Alertas informativas no crean tareas. Vencimiento de tarea escala la existente. Limitar plazo a la fecha real del compromiso. | Líder + dueño PHF | PHS-030–034 |
| D05 | Proveedor de identidad aparte: alcance por roles, autoaprobación, datos económicos, administración y responsables externos. | PM por asignación, líder por práctica, Dirección por alcance. Administrador no gana acceso de negocio. Evitar autoaprobación salvo delegación auditada definida. **Confirmado 2026-10-03:** autoaprobación permitida y auditada durante el piloto; perfiles y alcance definidos (ver Decisiones confirmadas). Pendiente: separación de funciones tras el piloto y responsables externos. | Dueño de producto + responsable de acceso | PHS-006, 007, 010, 019, 024, 035–037 |
| D06 | Stack, despliegue, identidad corporativa y volumen piloto. PostgreSQL ya elegido. | Propuesta: TypeScript, React/Vite, NestJS, PostgreSQL, Kysely/pg, SQL/dbmate, worker con outbox, OIDC y Docker. Confirmar entorno, volumen y versiones compatibles; ver STACK-TECNOLOGICO.md. **Confirmado 2026-10-03 (parcial):** stack TypeScript/React/NestJS, identidad validada en la base de datos para el MVP (OIDC pospuesto) y arquitectura de microservicios con base compartida (ADR-002). | Responsable técnico | PHS-003, 005, 017, 033, 041, 042 |
| D07 | Disponibilidad, volumen de prueba, respaldo, recuperación, retención e información sensible. | Dimensionar piloto; proponer RPO 24 h / RTO 4 h y retención definida por negocio. Restaurar antes de liberar. | Operación + dueño del dato | PHS-038, 041, 042 |
| D08 | Proyecto pausado/cerrado: ¿sigue evaluándose? ¿Permite acciones pendientes, reapertura o cancelación de hitos? | Conservar historia; declarar por estado qué cálculos, revisiones y alertas continúan. No esconder acciones abiertas al cerrar. | Dueño PHF + líder | PHS-014, 015, 020, 021, 025, 033, 037 |
| D09 | Evidencias: formatos, tamaño, expiración, adjuntos posteriores a validación y contenido sensible. | Texto y PNG/JPEG/WebP; límite inicial sugerido 5 MB por imagen. Evidencia del envío queda fijada; incorporación posterior identificada como adenda. | Dueño de producto + responsable técnico | PHS-017, 023, 024, 042 |
| D10 | Promedio de portafolio, exclusión de cerrados, datos incompletos, monedas y uso de provisional/oficial. | Media simple solo sobre evaluaciones oficiales disponibles; mostrar cobertura/frescura; agrupar importes por moneda. Confirmar si requiere ponderación comercial. | Dirección + finanzas | PHS-037 |

## Decisiones confirmadas

Confirmadas por el usuario (dueño del proyecto, único desarrollador y aprobador) el 2026-10-03, America/Mexico_City. Registro en BIT-0005.

| ID | Alternativa elegida | Motivo | Queda pendiente |
| --- | --- | --- | --- |
| D06 (parcial) | Stack TypeScript, React y NestJS, conforme a [ADR-001](../adr/001-stack-mvp.md). El equipo es una sola persona que desarrolla y aprueba; no hay otra restricción tecnológica. | Confirmación directa del usuario a la propuesta de BIT-0004. | Infraestructura de despliegue, almacenamiento de evidencias, volumen piloto y versiones exactas validadas en el esqueleto. |
| D06 (parcial) | La identidad del MVP se valida en la base de datos de la aplicación (usuario y credencial propios). No se integra un proveedor OIDC en esta etapa. | El usuario prioriza un MVP funcional antes que la integración corporativa. | Diseño de la credencial y de la sesión en PHS-004/PHS-005 (hash de contraseña, alta y restablecimiento); decidir más adelante si se añade OIDC. |
| D06 (parcial) | Arquitectura de microservicios: gateway y cuatro servicios (Identidad, Proyectos, Salud, Plataforma), base PostgreSQL compartida con el esquema actual y comunicación REST + eventos por outbox. Ver [ADR-002](../adr/002-microservicios.md). Confirmada el 2026-10-03, BIT-0008. | El usuario no quiere una arquitectura monolítica; eligió conservar la integridad del esquema probado y no añadir un broker. | Protocolo de envío de revisión entre Salud y Proyectos, identidad entre servicios, roles de base por servicio y validación en el esqueleto. |
| D05 (parcial) | Durante el piloto, un mismo usuario puede proponer y aprobar sus cambios y validar sus propias revisiones. Cada decisión conserva autor y queda auditada. Se mantiene el modelo de roles PM/líder/Dirección/administrador para separar funciones cuando haya más usuarios. | En el piloto habrá una sola persona operando. | Regla de separación de funciones posterior al piloto, alcance por rol, acceso a datos económicos y responsables externos. |

### D05 — Perfiles y alcance (confirmado el 2026-10-03, BIT-0012)

Elegido por el usuario entre las alternativas presentadas, tomando como base los tres perfiles de la demo (PM, Líder, Dirección) más el administrador:

| Perfil | Consulta | Opera | Aprueba | Datos económicos |
| --- | --- | --- | --- | --- |
| PM | Solo los proyectos donde es PM asignado o miembro del equipo. | Crea proyectos en su práctica; edita hitos, riesgos, economía y renovaciones de sus proyectos; propone cambios y envía revisiones. | No, salvo que acumule el rol de líder (piloto). | Sí, de sus proyectos. |
| Líder | Todos los proyectos de sus prácticas. | Crea y edita proyectos de su práctica. Propone cambios y envía revisiones solo si además es el PM. | Aprueba o rechaza cambios y valida o devuelve revisiones de su práctica. | Sí. |
| Dirección | Portafolio, salud e historial de las prácticas autorizadas. | No. | No. | Sí. |
| Administrador | Ningún dato de negocio por ser administrador. | Usuarios, credenciales, prácticas, membresías y catálogos. | No. | No. |

- Un administrador que necesite ver proyectos debe tener además un rol de negocio; puede asignárselo y la asignación queda auditada.
- Colaboradores y lectores del equipo (`project_member`) acceden a su proyecto sin ver importes.
- **Decisiones de diseño de la pantalla de administración**, confirmadas por el usuario el 2026-10-03:
  1. Un usuario puede acumular varios roles, en una o varias prácticas. La pantalla asigna y retira cada rol por separado y muestra todos los que tiene el usuario.
  2. El responsable de un hito, riesgo o acción puede actualizar ese elemento aunque no sea el PM. Ese permiso nace de la asignación en el proyecto, no de un rol que otorgue el administrador.
  3. El responsable técnico y el sponsor de un proyecto solo consultan. La pantalla no ofrece para ellos un rol con capacidad de edición.
- Sigue pendiente de D05: la regla de separación de funciones posterior al piloto y los responsables externos a la organización.

Consecuencias para ejemplos y pruebas: AT-06, AT-07 y AT-08 pueden ejecutarse con un mismo usuario con roles acumulados; los casos de alcance (AT-01, AT-15) siguen necesitando usuarios de prueba distintos. `app_user` identifica hoy al usuario por emisor y sujeto y no guarda credenciales: PHS-004/PHS-005 deben añadir la credencial local mediante una migración nueva.

## Cómo cerrar una decisión

Registrar ID, alternativa elegida, motivo, ejemplos con resultados, aprobador y fecha. Actualizar especificación, criterios afectados y necesidades de migración. Una decisión cerrada no se sobrescribe silenciosamente: registrar revisión si cambia.

## Diferencias explícitas entre prototipo y producto propuesto

0. Arquitectura: el prototipo es una página estática; el producto es un gateway y cuatro microservicios sobre una base compartida (ADR-002).
1. Roles simulados → permisos de servidor; localStorage → persistencia PostgreSQL.
2. Fecha simulada y reinicio global → utilidades de pruebas fuera de producción.
3. Baseline con conteo de hitos → snapshot completo; desplazamiento general → impactos específicos.
4. Review calculada antes de finalizar cambios → snapshot sobre el estado pertinente final.
5. Últimos dos snapshots → dos ciclos oficiales comparables para tendencia.
6. Cierre automático de tarea → cierre verificable según D04.
7. Sin datos no produce verde por defecto; A2 permite score NULL, F3 incluye un fallback de 70.
8. Historial recortado en memoria → política de retención explícita con trazabilidad.

## Brechas del esquema inicial a resolver en PHS-004

- `client.primary_contact` y `escalation_notes` son globales, mientras F3 captura contexto por proyecto. Determinar override en proyecto o contactos relacionados.
- El hito necesita una representación inequívoca de fecha comprometida histórica versus fecha operativa prevista; snapshots existentes ayudan pero no definen todo el contrato.
- `health_event` no referencia directamente tarea vencida ni almacena un estado “atendido”; decidir usar relación específica o derivarlo de acciones, sin referencias opacas no validadas.
- La política tiene cadencia y horizonte, pero no día preferido, festivos ni anclaje; resolver D03 antes de cambiar tablas.
- Falta hacer cumplir secuencia/estado de reenvíos y vincular explícitamente publicaciones oficiales a la decisión pertinente según D02.
- Reapertura, cancelación y vínculos de corrección deben conservar motivo y trazabilidad según D04/D08.
- Los triggers conservan historia; no crean auditoría automáticamente, ni implementan autorización o transacciones de dominio.
- Definir contrato validable de JSONB para propuesta, baseline, review, reglas y evaluación; no considerarlo almacenamiento arbitrario.

### Clasificación para PHS-004 (BIT-0010, 2026-10-03)

| Brecha o hallazgo | Clasificación |
| --- | --- |
| Contacto y escalación por proyecto | Pendiente: decisión de producto en PHS-010. |
| Fecha comprometida frente a fecha operativa del hito | Pendiente: contrato en PHS-015; depende de D08. |
| Vínculo de evento con tarea vencida y estado "atendido" | Pendiente: D04, PHS-030. |
| Día preferido, festivos y anclaje del ciclo; ciclos solapados | Pendiente: D03, PHS-020. No se añadió restricción de solapamiento para no inventar la regla de calendario. |
| Secuencia de reenvíos y publicación oficial | Pendiente: D02, PHS-024. |
| Reapertura, cancelación y vínculos de corrección | Pendiente: D04/D08. |
| Los triggers no generan auditoría ni autorización | Resuelto por contrato: la inserta cada servicio (PHS-008); permisos de escritura por servicio en la migración 005. |
| Contrato validable de los JSONB | Pendiente: PHS-003/PHS-004, junto con los contratos por servicio. |
| Textos obligatorios vacíos (BIT-0005) | Cubierto por la migración 004. |
| Borrado físico de filas operativas (BIT-0005) | Cubierto por la migración 004. |
| Fechas imposibles (BIT-0005) | `outbox_message` cubierto por la 004. La fecha de cumplimiento futura de un hito queda al servicio Proyectos (PHS-015): depende de la zona horaria del proyecto. |
| Claves foráneas sin índice (BIT-0005) | Aplazado: sin borrado físico el costo es menor; decidir con consultas y volumen medidos. |
| Propiedad de tablas por servicio (ADR-002) | Cubierto por la migración 005. |

Estas brechas no se modifican en SQL durante la especificación. La migración inicial es una base validada de integridad, no una declaración de completitud funcional.
