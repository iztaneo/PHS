# Matriz de pruebas automatizadas PHS

Esta matriz es la referencia de cobertura para PHS-040 y el inicio de PHS-041. Su fuente verificable es `tests/e2e/matrix.json`; `pnpm test:matrix` comprueba IDs únicos, los 18 casos AT, las tres pruebas UI y la existencia de cada archivo relacionado.

## Escenarios integrales AT-01 a AT-18

| Caso | Cobertura automatizada | Nivel | Pruebas | Pendiente real |
| --- | --- | --- | --- | --- |
| AT-01 Alta | Completa | Gateway + navegador | E2E-01, E2E-03, UI-02 | Aceptación del usuario. |
| AT-02 Vencimiento | Parcial | Gateway + integración | E2E-08, `outlook.int.test.ts` | Simular cruce del reloj con todos los clientes cerrados. |
| AT-03 Nada cambió | Completa | Gateway | E2E-07 | — |
| AT-04 Revisión vencida | Automatizada en integración | Servicio + PostgreSQL | `review.int.test.ts` | Elevarla al gateway cuando exista reloj de prueba. |
| AT-05 Evidencia | Completa | Gateway | E2E-04, E2E-07 | — |
| AT-06 Devolución | Completa | Gateway | E2E-07 | — |
| AT-07 Cambio | Completa | Gateway | E2E-05 | — |
| AT-08 Conflicto | Completa | Gateway concurrente | E2E-06 | — |
| AT-09 Finanzas | Completa | Gateway | E2E-04 | — |
| AT-10 Sin datos | Completa | Gateway | E2E-11 | — |
| AT-11 Cierre de tarea | Completa | Gateway | E2E-08 | — |
| AT-12 Recurrencia | Completa | Gateway | E2E-08 | — |
| AT-13 Historia | Parcial | Integración | `assessments.int.test.ts`, `history.test.ts` | Cambio de reglas y recálculo histórico identificado. |
| AT-14 Calendario | Automatizada en integración | Función + servicio + PostgreSQL | `cadence.test.ts`, `review.int.test.ts` | Gateway con reloj controlado. |
| AT-15 Portafolio | Completa | Gateway | E2E-01, E2E-12 | — |
| AT-16 Recuperación | Parcial | Reinicio manual automatizable + integración | Auditoría BIT-0032, `notifications.test.ts` | Inyección de caída entre commit/ack y restauración de backup. |
| AT-17 Adopción | Manual | Piloto | Guion de PHS-041 | Diez revisiones humanas y p90 de captura activa. |
| AT-18 Vida del proyecto | Completa | Gateway | E2E-13 | — |

Resumen: 12 casos tienen cobertura completa, dos están automatizados a nivel integración, tres son parciales y uno requiere ejecución humana.

## Interfaz y accesibilidad inicial

| ID | Prueba Playwright | Vista | Comprobaciones |
| --- | --- | --- | --- |
| UI-01 | Login y teclado | Inicio de sesión | Etiquetas accesibles, orden de foco, error con `role=alert` e inicio válido. |
| UI-02 | Recorrido principal | 1280 × 800 | Inicio, portafolio, proyectos, detalle, revisión y cierre de sesión. |
| UI-03 | Vista móvil | 375 × 812 | Menú accesible, portafolio, proyecto, historial y ausencia de desbordamiento global. |

Estas tres pruebas usan Chrome local mediante Playwright. En otro entorno puede seleccionarse un canal con `PHS_E2E_BROWSER_CHANNEL`; si no existe un navegador compatible debe instalarse antes de la ejecución.

## Comandos

| Comando | Alcance | Resultado esperado actual |
| --- | --- | --- |
| `pnpm test:matrix` | Integridad de la matriz | Aprobado. |
| `pnpm test:e2e:api` | Runner por gateway; requiere entorno E2E levantado | 13 escenarios aprobados en BIT-0034. |
| `pnpm test:e2e:web` | Tres recorridos Playwright; requiere entorno E2E levantado | 3 escenarios aprobados en BIT-0034. |
| `pnpm test:e2e` | Base aislada, migraciones, seed, servicios, API y navegador | 13/13 API y 3/3 navegador; código 0 en BIT-0034. |

## Regla de mantenimiento

Toda historia que cambie un escenario AT actualiza en el mismo commit la prueba, `matrix.json`, esta matriz y la bitácora. Un caso no se marca completo por existir en la matriz: debe tener una aserción ejecutable y una corrida registrada.
