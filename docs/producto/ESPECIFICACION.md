# PHS — Especificación de aplicación v0.1

Estado: propuesta de producto para refinamiento. Derivada del prototipo y los documentos PHF; no equivale a reglas aprobadas ni a funcionalidades ya construidas. PostgreSQL es la base elegida. El backlog asociado es [BACKLOG.md](BACKLOG.md).

## 1. Objetivo y alcance

Permitir que PM, líderes y Dirección conozcan la salud de proyectos y servicios, identifiquen deterioro, actualicen información con poco esfuerzo y den seguimiento a acciones hasta su resolución. La aplicación mantiene un modelo común de gobierno sin sustituir las herramientas de ejecución del cliente.

El MVP incluye acceso real, proyectos, equipo, líneas base, hitos, riesgos, observaciones económicas, renovaciones, revisiones, evidencias, aprobación de cambios, evaluación explicable, eventos, tareas, alertas internas, portafolio e historial. El flujo completo de once etapas debe poder recorrerse en producción.

Fuera del MVP propuesto: SaaS multiempresa, aplicación móvil nativa, IA predictiva, sincronización con herramientas externas, correo automático, importación masiva de datos locales y gestión documental avanzada. Estas exclusiones son una propuesta de alcance, no una cancelación definitiva.

Supuestos de trabajo: una empresa, varias prácticas, interfaz en español, usuarios autenticados (decisión del 2026-10-03: credenciales propias validadas en la base de datos para el MVP; identidad corporativa pospuesta), importes de cada proyecto en una sola moneda y despliegue inicialmente centralizado. El [stack propuesto](../STACK-TECNOLOGICO.md) concreta React/Vite, NestJS y PostgreSQL. Restricciones del equipo, proveedor de identidad, infraestructura y compatibilidad de dependencias permanecen pendientes.

## 2. Fuentes y precedencia

| Código | Fuente | Uso |
| --- | --- | --- |
| F1 | `Project-Health-System-Prototype/phf.html` | Propósito, principios, seis componentes, criterios MVP y definiciones. |
| F2 | `Project-Health-System-Prototype/flujo-phf.html` | Once etapas y retroalimentación por cambios aprobados. |
| F3 | `Project-Health-System-Prototype/index.html` | Pantallas, formularios, funciones y comportamiento observable por inspección estática. |
| F4 | `Project-Health-System-Prototype/README.md` | Guion operativo, alcance declarado y limitaciones. |
| A1 | `docs/ARQUITECTURA-PHS.md` | Propuesta técnica y hallazgos. |
| A2 | `docs/DATABASE-PHS.md`, `db/migrations/001_initial.sql` | Diseño inicial de persistencia; no sustituye decisiones de producto. |

Cuando hay conflicto, registrar la decisión en [DECISIONES.md](DECISIONES.md). El comportamiento de demostración no se convierte automáticamente en requisito de producción. El código se ha revisado de forma estática; los escenarios del backlog deben validarse funcionalmente durante implementación.

Clasificación: **derivado** = presente en F1–F4; **propuesto** = adaptación para producción o decisión de diseño; **pendiente** = necesita definición de negocio/entorno antes de aceptar las historias afectadas.

## 3. Personas y autorización propuesta — D05

| Capacidad | PM | Líder | Dirección | Administrador |
| --- | --- | --- | --- | --- |
| Consultar | Proyectos asignados | Prácticas asignadas | Prácticas autorizadas | Según permiso de negocio explícito |
| Crear proyecto | En práctica autorizada | En práctica autorizada | No por defecto | No por administrar usuarios |
| Editar operación | Proyectos asignados | Proyectos de su práctica | No por defecto | No por defecto |
| Proponer cambios / enviar revisión | Proyectos asignados | Solo con rol operativo adicional | No por defecto | No por defecto |
| Decidir cambios / validar revisión | No por defecto | En su alcance | Solo delegación explícita | No por defecto |
| Gestionar usuarios y catálogos | No | No por defecto | No por defecto | Sí |

El responsable de una acción o riesgo debe tener acceso al proyecto y capacidad explícita de actualizarlo. Ser responsable técnico o integrante no concede aprobación. Un usuario puede acumular roles; durante el piloto se permite la autoaprobación auditada (D05, confirmado el 2026-10-03); la regla posterior al piloto sigue pendiente. Los permisos se aplican a API, archivos, búsquedas, conteos y exportaciones futuras, además de la UI. Ningún selector visual concede un rol.

## 4. Recorridos y pantallas

| Pantalla / capacidad | Entrada y comportamiento | Historias |
| --- | --- | --- |
| Acceso y administración | Iniciar/cerrar sesión, asignar alcance y mantener catálogos. Nueva capacidad de producción. | PHS-005–007 |
| Proyectos | Listar por alcance, buscar, crear y seleccionar proyecto; vacío con alta permitida. | PHS-009 |
| Ficha | Identificación, cliente/contacto/escalación, responsables, equipo, fechas, economía y renovaciones. | PHS-009, 010, 012–014 |
| Línea base | Crear inicial, consultar vigente e históricas, comparar compromisos. | PHS-011, 019 |
| Hitos | Registrar, seguir, completar, evidenciar y mostrar vencimiento; distinguir fecha base de operativa. | PHS-015, 017 |
| Riesgos | Registrar, mitigar, materializar, cerrar y consultar actualizaciones. | PHS-016 |
| Cambios | Proponer impactos específicos, revisar y aprobar/rechazar. | PHS-018, 019 |
| Ciclo de revisión | Frecuencia, próxima revisión, horizonte y políticas de evidencia/validación/acciones. | PHS-020 |
| Health Review | Expectativas, campos adaptativos por cambio, borrador, soporte y envío. | PHS-021–023 |
| Validaciones | Bandeja del líder, detalle, validar/devolver y reenvío del PM. | PHS-024 |
| Salud del proyecto | Score, dimensiones, desviaciones, gates, confianza, tendencia y forecast explicados. | PHS-025–029 |
| Health Events | Condiciones, severidad, episodio, origen y acciones asociadas. | PHS-030 |
| Acciones | Bandeja, alta manual, asignación, plazo, prioridad, seguimiento y cierre. | PHS-031, 032 |
| Alertas y prioridades | Condiciones ordenadas y enlace al elemento que requiere intervención. | PHS-034 |
| Health Center | PM: qué atender; líder: dónde intervenir; Dirección: estado de la práctica. | PHS-035–037 |
| Portafolio | Tarjetas/tabla, filtros y consolidación autorizada. | PHS-037 |
| Timeline e historial | Pasado, presente, próximos ciclos y registro atribuible de operaciones. | PHS-038 |
| Modelo PHF | Definiciones, flujo y reglas vigentes identificadas por versión. | PHS-039 |
| Simulación y demo | Reloj inyectable y fixtures únicamente en desarrollo/pruebas. | PHS-040 |

Patrón compartido: carga, vacío, error recuperable, guardado en curso, confirmación y conflicto de edición. Conservar lo capturado cuando falle la red; no afirmar que se guardó antes de recibir confirmación. Navegación por teclado, etiquetas comprensibles y semáforos acompañados de texto.

## 5. Datos y validaciones funcionales

| Entidad | Obligatorios | Opcionales / reglas |
| --- | --- | --- |
| Proyecto | Código único, nombre, cliente, tipo, práctica, estado, inicio/fin, PM, líder, responsable técnico, moneda, zona horaria. | Descripción, sponsor, contacto y escalación. Fin >= inicio. Código puede generarlo el servidor. |
| Equipo | Usuario activo, proyecto y función. | Asignación 0–100%; conservar referencias históricas si se desactiva usuario. |
| Baseline | Versión, alcance, inicio/fin, compromisos completos, equipo, motivo y autor. | Presupuesto y horas pueden faltar: distinguir NULL de cero y avisar sobre la evaluación incompleta. |
| Hito | Nombre, entregable, responsable, fecha comprometida, criticidad. | Comentario y evidencia; fecha real al completar. Nueva fecha operativa no cambia la baseline por sí sola. |
| Riesgo | Título, tipo proyecto/cliente, categoría, probabilidad, impacto, responsable, deadline de mitigación y estado. | Descripción y estrategia; baja/media/alta y bajo/medio/alto se codifican 1–3. |
| Observación económica | Fecha efectiva, costo acumulado, autor y origen. | Esfuerzo acumulado; no sumar observaciones acumuladas. Corrección conserva el dato original. |
| Renovación | Fecha, responsable y estado. | Notas y resultado; futuras renovaciones conservan las anteriores. |
| Cambio | Título, origen, descripción, áreas e impactos específicos, proponente. | Deltas positivos o negativos válidos si el resultado no viola fechas/importes; ningún delta se aplica dos veces. |
| Ciclo | Frecuencia, próxima fecha, política y horizonte. | Semanal/quincenal/mensual; reglas calendáricas y excepciones en D03. |
| Review | Autor real, ciclo, fecha, temas o “nada cambió”, expectativas evaluadas. | Clima del cliente, datos modificados, soporte y duración activa. Soporte condicionado a política. |
| Acción | Título, responsable, plazo, prioridad y estado. | Origen manual/evento, notas; comentario y fecha al cerrar. |
| Evidencia | Autor, proyecto, entidad destino y texto o archivo. | Imagen con tipo/tamaño/hash; acceso privado y política D09. |

A2 no refleja todavía todos estos contratos: PHS-004 incluye el análisis de brechas. No añadir datos de negocio al JSON sin definir su contrato y sus validaciones.

## 6. Estados y transiciones propuestas

| Entidad | Transiciones | Condiciones |
| --- | --- | --- |
| Proyecto | Por iniciar → En ejecución; En ejecución ↔ Pausado; En ejecución → En renovación; En renovación → En ejecución/Cerrado; En ejecución → Cerrado. | Cambios justificados y auditados; cierre, reapertura y efecto de pausa pendientes D08. |
| Hito | Pendiente → En curso → Cumplido; Pendiente → Cumplido; Pendiente/En curso → Reprogramado → En curso/Cumplido. | Reprogramado es fecha operativa distinta; vencido es condición derivada. Cancelación y reapertura requieren motivo y política D08. |
| Riesgo | Abierto → En mitigación → Mitigado → Cerrado; Abierto/En mitigación → Materializado → Cerrado. | Reabrir mitigado/cerrado requiere motivo; materializado no equivale a resuelto. |
| Cambio | Propuesto → Aprobado o Rechazado. | Decisión única e inmutable; corrección de propuesta enviada mediante nueva propuesta. |
| Review | Borrador → Enviada → Pendiente de validación → Validada/Devuelta; Devuelta → nuevo envío. | Sin validación requerida, envío queda cerrado. Cada reenvío conserva versión anterior. D02 define vigencia. |
| Evento | Abierto → Resuelto; recurrencia → nuevo episodio abierto. | Resolver requiere desaparecer o tratar la condición según regla; no reescribir episodio anterior. |
| Acción | Pendiente ↔ En curso ↔ Bloqueada; estados abiertos → Completada/Cancelada. | Cierre con comentario; reabrir exige política explícita, no sobrescribir cierre histórico. D04. |

Completar una acción no elimina una desviación que sigue existiendo. Resolver una condición no prueba automáticamente que se completó el trabajo asociado: cambio propuesto respecto al prototipo, pendiente D04.

## 7. Catálogo de reglas

| ID | Regla / contrato | Estado / origen |
| --- | --- | --- |
| RN-01 | Salud administrativa y score son conceptos distintos. | Derivado F1. |
| RN-02 | Comparar contra baseline vigente; cambios incorporados no se suman otra vez. Reprogramación no aprobada no cambia el compromiso base. | Derivado F2; precisión propuesta para corregir F3. |
| RN-03 | Score ponderado de dimensiones disponibles, limitado por el menor gate activo. Sin dimensiones evaluables: “Sin evaluación”. | Fórmula F3; ausencia total propuesta D01. |
| RN-04 | Desempeño 25, finanzas 20, riesgos 20, cliente 12, gobernanza 13, equipo 10. | Valores F3, candidatos sujetos a D01. |
| RN-05 | Gates candidatos: desvío operativo >10 (tope 55), financiero >3 (58), hito crítico vencido (50), riesgo crítico vencido/materializado (50), revisión vencida (65), cliente crítico (45). | F3; unidades, severidad y calibración D01. Exactamente 10/3 no activa los umbrales estrictos. |
| RN-06 | Score >=80 saludable; >=60 y <80 en atención; <60 en riesgo. Mostrar score y motivos. | Candidato F3, D01. |
| RN-07 | Datos ausentes se muestran s/d, se excluyen del promedio y afectan confianza según política. | F4; excepciones de gobernanza en F3 deben resolverse D01. |
| RN-08 | Confianza separa calidad/actualidad del dato de salud del proyecto. | F1/F3, coeficientes D01. |
| RN-09 | Tendencia usa cortes comparables de ciclos oficiales; menos de dos = histórico insuficiente. | F1/F4; corrección propuesta frente a últimos dos snapshots de F3. |
| RN-10 | Forecast determinista y explicable por próximos compromisos, riesgos, tareas y renovaciones; no probabilidad estadística. | F1/F3, coeficientes D01 y calendario D03. |
| RN-11 | No aceptar “nada cambió” si hay expectativas críticas que requieren tratamiento; recalcular en servidor al enviar. | F2/F3. Revisión vencida por sí sola necesita excepción definida en D02 para evitar bloqueo circular. |
| RN-12 | Soporte texto/imagen obligatorio donde lo exige la política del ciclo. | F3/F4, formatos/tamaño D09. |
| RN-13 | Política de validación y efecto sobre salud oficial quedan explícitos; snapshot de evaluación usa el estado final pertinente. | Propuesta D02 corrige orden de cálculo de F3. |
| RN-14 | Aprobación crea baseline nueva completa, cambia solo elementos afectados y conserva toda la historia. Rechazo no cambia compromisos. | F2; precisión propuesta para reemplazar desplazamiento de todos los hitos de F3. |
| RN-15 | Evento identifica un hecho; tarea identifica el trabajo con dueño y plazo. Distinguir alertas informativas de accionables. | F2, política D04. |
| RN-16 | Una condición persistente mantiene su episodio; los reintentos no duplican evento, tarea ni entrega. | Producción A1/A2. |
| RN-17 | Vencimiento se evalúa al pasar la fecha de negocio en zona configurada. Procesos corren sin navegador abierto. | Producción A1/A2; semántica D03. |
| RN-18 | Consolidar solo proyectos autorizados; no sumar distintas monedas ni mezclar scores desconocidos como cero. | Propuesta D10. |
| RN-19 | Usuario, fecha, motivo y valores previos/nuevos acompañan cambios relevantes. Los snapshots oficiales no se reescriben. | F2, A1/A2. |
| RN-20 | La revisión normal apunta a menos de 60 segundos de interacción activa. No exigir ese tiempo al resolver incidentes complejos. | F1/F4; medición propuesta NF-01. |

Los algoritmos de F3 `plannedProgress`, `actualProgress`, `financialDeviation`, `dimSchedule`…`dimTeam`, `assess`, `confidence`, `trend`, `forecast`, `expectations` y `autoTaskFor` son referencias para elaborar casos, no una librería aprobada para copiar a producción. PHS-002 exige una tabla de fórmulas y entradas/salidas resuelta antes de aceptar el motor.

### Ejemplos candidatos para validación D01

- Dimensiones disponibles desempeño=80 y finanzas=60: promedio `(80×25 + 60×20)/45 = 71.111…`; un gate de 50 limita resultado a 50. Confianza se presenta por separado.
- Presupuesto 100 000, 50% del calendario transcurrido y costo acumulado 54 000: fórmula del prototipo produce `(54 000 − 50 000)/100 000 ×100 = 4%`. No equivale al 8% respecto del gasto esperado ni mide directamente margen.
- Cuatro hitos con dos exigibles y solo uno cumplido: avance esperado 50%, real 25%, desviación 25 puntos porcentuales bajo el conteo del prototipo. Un hito en curso aporta 0.5 en F3; decidir si es adecuado por servicio.
- Scores oficiales de ciclos 70 y 66: candidato de tendencia descendente (delta −4). Tres ediciones del mismo día no son tres ciclos.
- Regla >10: 10 no activa; 10.01 sí. Calcular antes de redondear la presentación y registrar precisión; D01 debe conciliar el formato entero del prototipo y los decimales del esquema.

### Expectativas y acciones candidatas de F3

| Condición | Ventana del prototipo | Acción / plazo propuesto por prototipo |
| --- | --- | --- |
| Hito próximo/vencido | Próximo ciclo; advertencia a <=3 días; crítico al vencer. | Vencido: responsable del hito, +2 días, alta. |
| Mitigación próxima/vencida | <=7 días / fecha anterior a hoy. | Vencida: responsable del riesgo, +2 días, alta. |
| Review vencida | Fecha del ciclo anterior a hoy. | PM, +1 día, alta. |
| Renovación | <=45 días; advertencia <=15; vencida crítica. | Responsable de renovación/líder, +10 días, media. |
| Desvío operativo/financiero | >10 / >3 según fórmula candidata. | PM, +5 días, alta. |
| Cambio pendiente | Mientras no tenga decisión. | Líder, +7 días, media. |
| Acción vencida | Fecha anterior a hoy, aún abierta. | Escalar la acción existente; no generar recursivamente otra. |
| Fin de proyecto superado | Fin anterior a hoy y proyecto no cerrado. | Pedir cierre o cambio aprobado; no hay tarea automática definida en F3. |

Validar estos plazos en D04; por ejemplo, +10 días podría quedar después de una renovación próxima. El diseño definitivo debe limitar plazos según compromiso real y evitar ruido.

## 8. Contratos transversales y no funcionales

Son objetivos propuestos para aceptar el MVP; D06/D07 fijan entorno de prueba y límites definitivos. No son mediciones actuales.

| ID | Requisito verificable |
| --- | --- |
| NF-01 | Registrar duración activa de review separada del tiempo de espera de validación. Piloto con al menos 10 revisiones normales representativas; objetivo p90 <60 s, reportar tamaño de muestra y exclusiones de incidentes. |
| NF-02 | API de listas y detalle p95 <=1 s; portafolio <=2 s, con conjunto piloto acordado y sin incluir carga de archivos. Registrar volumen, concurrencia y entorno; no aceptar cifras sin escenario. |
| NF-03 | Detección de vencimiento en <=15 min respecto al calendario configurado; cambios operativos reflejados en salud en <=30 s. Mostrar fecha de cálculo y estado pendiente/error. |
| NF-04 | Las pruebas deben demostrar cero exposición entre alcances no autorizados en consultas, conteos y archivos. No usar tokens ni datos de evidencia en logs. |
| NF-05 | Dos editores no se sobrescriben: versión esperada, rechazo de conflicto y recuperación de captura. Reintentos de envío/aprobación no duplican efectos. |
| NF-06 | Navegación de flujos principales por teclado; foco y errores identificables; etiquetas para lector de pantalla; estado no comunicado solo por color. Validar escritorio y ancho de 375 px sin perder acciones esenciales. |
| NF-07 | Respaldos y restauración ensayada; proponer RPO 24 h y RTO 4 h para piloto, confirmar en D07 antes de liberar. Retención no se deduce de estos objetivos. |
| NF-08 | Errores trazables por request/job ID, métricas de trabajos fallidos/atrasados, reintentos acotados y procedimiento de recuperación. |
| NF-09 | Las migraciones y el motor tienen pruebas automáticas; release identifica versión de aplicación y de reglas. Reloj de pruebas separado del real. |
| NF-10 | Descarga autorizada de evidencias; validación de tipo y tamaño real, nombres seguros y manejo de carga fallida. Formatos/límites D09. |

## 9. Contratos de interacción con backend

Los contratos finales serán OpenAPI en PHS-003. Lecturas paginadas y filtradas por alcance. El servidor obtiene autor y permisos de la sesión; no confía en IDs de autor ni scores suministrados por el navegador.

Comandos relevantes: crear proyecto, publicar baseline inicial, actualizar hito/riesgo, registrar observación, proponer cambio, decidir cambio, guardar borrador, enviar revisión, validar/devolver revisión, actualizar/cerrar tarea y adjuntar evidencia. Aprobaciones y envíos llevan clave de idempotencia y versión esperada; su resultado incluye entidad creada y revisión resultante.

Errores diferenciados: datos inválidos, sin acceso, conflicto de versión/estado, archivo rechazado y fallo temporal. El contenido de error no revela recursos fuera del alcance. Una transacción fallida no deja aprobación sin baseline, revisión sin trazabilidad ni cambios parciales.

## 10. Criterio de éxito del MVP

Recorrer con usuarios reales el flujo completo: proyecto → baseline → compromisos → expectativa → review → evaluación → acción → intervención → cambio aprobado → baseline nueva → historial. Demostrar trazabilidad, permisos, ausencia de duplicados y conservación de compromisos previos. El piloto debe medir utilidad y tiempo de revisión, no solo contar pantallas terminadas.
