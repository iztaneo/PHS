# Plan de entregas y aceptación PHS

Propuesta de secuencia, sin fechas ni promesas de capacidad. Las entregas son incrementos verificables; no equivalen a sprints. Los tamaños del backlog sirven para refinamiento y deben estimarse con el equipo.

## Entregas

| Entrega | Resultado demostrable | Historias | Salida |
| --- | --- | --- | --- |
| R0 — Definición | Políticas y contratos para construir sin ambigüedades fundamentales. | PHS-001–003 | Decisiones del alcance documentadas; catálogo de fórmulas con ejemplos; stack y contratos base definidos. |
| R1 — Registro y compromisos | Usuario real registra un proyecto, su equipo e hitos y publica baseline. | PHS-004–011, PHS-015 | Datos persisten; alcance y autoría reales; baseline conserva compromisos; conflictos no pierden datos. |
| R2 — Operación evaluable | PM mantiene riesgos/economía; líder aprueba un cambio; sistema explica salud operativa. | PHS-012–014, PHS-016–019, PHS-025–026 | Ejemplo aprobado produce score explicable; cambio conserva baseline anterior y modifica solo compromisos seleccionados. |
| R3 — Ciclo completo | Revisión con expectativas, validación, confianza, tendencia, forecast y acciones automáticas. | PHS-020–024, PHS-027–033 | Con navegador cerrado se detectan vencimientos; envío/reenvío y reintentos conservan coherencia. |
| R4 — Gobierno | PM, líder y Dirección priorizan desde vistas y portafolio con trazabilidad. | PHS-034–039 | Conteos y agregados verificables por alcance; navegación a orígenes; historial y ayuda consistentes. |
| R5 — Piloto operable | Flujo integral probado, usabilidad medida y restauración demostrada. | PHS-040–042 | Criterios E2E/NF satisfechos, decisiones bloqueantes cerradas y operación documentada. |
| Posterior | Importación, integraciones e investigación de IA solo si justifican valor. | PHS-043–045 | Repriorizar tras resultados del piloto; dividir candidatos amplios en historias antes de construir. |

El orden dentro de cada entrega se calcula por dependencias. Por ejemplo, PHS-015 se implementa antes de PHS-011 aunque su ID sea mayor. Todas las historias P0 y P1 forman parte del MVP descrito; P1 no significa opcional dentro de este compromiso de alcance.

## Primer incremento de desarrollo

1. Resolver D06 y el alcance de D05; registrar contratos en PHS-003 y políticas en PHS-001.
2. Preparar esquema/migraciones y acceso real: PHS-004–008 en su orden de dependencias.
3. Implementar alta y consulta de proyecto, responsables e hitos: PHS-009, 010 y 015.
4. Publicar baseline inicial: PHS-011.
5. Demostrar que dos usuarios con distinto alcance obtienen resultados diferentes, que una recarga conserva datos y que modificar un hito no altera el snapshot aprobado.

Esta es la primera entrega vertical. El cálculo explicable se añade en R2 cuando PHS-002 y las entradas operativas estén definidas. No se espera a completar todos los dashboards para validar valor.

## Matriz de trazabilidad del flujo PHF

| Etapa de F2 | Capacidad | Historias |
| --- | --- | --- |
| 1. Definir | Proyecto, cliente, responsables y equipo. | PHS-009, 010 |
| 2. Línea base | Compromisos versionados. | PHS-011, 019 |
| 3. Operar | Hitos, riesgos, economía, renovaciones y cambios. | PHS-012–018 |
| 4. Observar | Timeline. | PHS-038 |
| 5. Anticipar | Expectativas y forecast. | PHS-021, 029 |
| 6. Revisar | Ciclo, borrador, envío y validación. | PHS-020, 022–024 |
| 7. Interpretar | Eventos objetivos y episodios. | PHS-030 |
| 8. Evaluar | Dimensiones, gates, score, confianza y tendencia. | PHS-025–028 |
| 9. Actuar | Tareas automáticas/manuales y seguimiento. | PHS-031, 032 |
| 10. Gobernar | Alertas, vistas por rol y portafolio. | PHS-034–037 |
| 11. Aprender | Historial, contexto y consulta del modelo. | PHS-038, 039 |
| Retroalimentación | Cambio aprobado → baseline nueva → nuevo cálculo. | PHS-018, 019, 026, 033 |
| Producción | Acceso, integridad, trabajos, pruebas y operación. | PHS-003–008, 017, 033, 040–042 |

## Escenarios de aceptación integrales

Son especificaciones de pruebas futuras; no se presentan como pruebas ya ejecutadas de una aplicación inexistente. PHS-040 las automatiza donde aporte valor. Casos dependientes de D01–D10 reciben fixtures y resultados definitivos al cerrar las decisiones.

| Caso | Preparación y acción | Resultado esperado | Historias |
| --- | --- | --- | --- |
| AT-01 Alta | PM autorizado crea proyecto, hito y baseline; recarga sesión. | Datos persisten, compromisos completos, autor real, proyecto fuera de alcance no visible. | PHS-005, 006, 009, 011, 015 |
| AT-02 Vencimiento | Hito crítico pendiente cruza su fecha con navegador cerrado. | Gate/evento/tarea según versión de reglas, dentro de NF-03; un reintento no duplica. | PHS-025, 030, 031, 033 |
| AT-03 Nada cambió | Enviar esa opción con hito vencido sin tratamiento. | Rechazo explícito, captura conservada; envío válido después de tratamiento acordado. | PHS-021–023 |
| AT-04 Revisión vencida | Solo está vencido el propio ciclo y no hay otro cambio requerido. | No existe bloqueo circular; el envío trata su propio vencimiento conforme D02. | PHS-020–023 |
| AT-05 Evidencia | Política exige soporte; intentar enviar sin él y cargar archivo inválido. | Ambos rechazados sin publicación parcial; soporte válido accesible solo por alcance. | PHS-017, 023 |
| AT-06 Devolución | Líder devuelve review; PM corrige y reenvía; líder valida. | Se preservan dos envíos y sus decisiones, una tarea de corrección y efecto oficial según D02. | PHS-024, 026, 032 |
| AT-07 Cambio | Aprobar cambio de fecha sobre uno de tres hitos. | Baseline N+1 completa; solo hito seleccionado cambia; versión N reconstruible; una sola aplicación del delta. | PHS-018, 019 |
| AT-08 Conflicto | Dos líderes deciden el mismo cambio y dos PM editan mismo dato. | Una decisión/actualización válida; segunda operación informa conflicto o devuelve resultado idempotente. | PHS-008, 019 |
| AT-09 Finanzas | Presupuesto 100 000, 50% calendario, costo 54 000. | Fórmula candidata devuelve 4%, explicada con denominador; resultado definitivo conforme D01. Corrección conserva observación previa. | PHS-012, 025, 026 |
| AT-10 Sin datos | Proyecto sin presupuesto ni hitos evaluables. | Dimensiones s/d, cobertura/confianza visibles; nunca se deduce verde por ausencia de información. | PHS-025–027, 037 |
| AT-11 Cierre de tarea | Completar tarea mientras condición origen persiste; luego resolver condición. | Evento permanece activo mientras corresponda; acciones y condición mantienen estados separados según D04. | PHS-030–032 |
| AT-12 Recurrencia | Resolver condición y hacerla reaparecer después; ejecutar worker dos veces. | Nuevo episodio, una tarea por política, ninguna repetición por reintento. | PHS-030, 031, 033 |
| AT-13 Historia | Cambiar reglas y recalcular un corte antiguo. | Snapshot original intacto; recálculo identificado; tendencia oficial no mezcla cortes arbitrarios. | PHS-026, 028, 038 |
| AT-14 Calendario | Ciclo mensual del 31 de enero, año bisiesto y distinta zona horaria. | Fechas exactas definidas por D03; no se duplica ciclo ni adelanta vencimiento por UTC. | PHS-020, 021, 033 |
| AT-15 Portafolio | Proyectos en MXN/USD, uno sin evaluación y otro fuera de alcance. | No hay suma entre monedas, se declara cobertura y el proyecto no autorizado no afecta conteos. | PHS-006, 037 |
| AT-16 Recuperación | Fallo entre transacción y worker; después caída/restauración del entorno piloto. | Outbox recupera trabajo sin duplicar; respaldo restaura datos/evidencias según RPO/RTO acordados. | PHS-008, 033, 042 |
| AT-17 Adopción | Al menos 10 revisiones normales con usuarios representativos. | Medición activa y p90 comparados con 60 s; no ocultar casos lentos ni confundir validación con captura. | PHS-022, 041 |
| AT-18 Vida del proyecto | Pausar, cerrar y reabrir proyecto con tareas pendientes. | Historia conservada y efecto en ciclos/eventos exactamente conforme D08; pendientes no desaparecen. | PHS-014, 020, 033, 037 |

## Gestión del backlog

Mantener ID estable aunque cambie título o entrega. Al refinar una historia grande, crear subhistorias con relación al ID original y distribuir sus criterios sin perderlos. El responsable y la estimación se asignan con capacidad real del equipo; no hay fechas comprometidas en este documento.

Antes de iniciar: cerrar decisiones de la historia, revisar dependencia y acordar evidencia de aceptación. Al finalizar: vincular PR/commit, pruebas y demostración. Registrar estado real (por refinar, lista, en curso, revisión, aceptada) sin confundir documento escrito con funcionalidad terminada.
