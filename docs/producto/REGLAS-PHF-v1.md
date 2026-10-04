# Reglas del motor PHF — versión 1

Fecha: 2026-10-03, America/Mexico_City (BIT-0018). Conjunto de reglas `v1` del motor de salud, resultado de la decisión D01. Corresponde a PHS-002. El motor todavía no está construido: este documento es su especificación y sus ejemplos serán sus pruebas.

Origen de cada regla:

- **Decidido:** elegido por el usuario el 2026-10-03.
- **Prototipo v1:** valor tomado del prototipo y adoptado por el usuario como versión 1, sin calibrar con proyectos reales.
- **Propuesto:** detalle que completa una decisión. El usuario confirmó todos los marcados así el 2026-10-03; la etiqueta se conserva para distinguir qué eligió entre alternativas y qué aceptó como propuesta.

Cada evaluación guarda la versión de reglas con la que se calculó. Cambiar un coeficiente crea una versión nueva; las evaluaciones anteriores no se recalculan en silencio.

## 1. Avance y desviación de proyecto

**Decidido:** el avance se mide por peso de cada hito.

| Concepto | Fórmula | Origen |
| --- | --- | --- |
| Hitos considerados | Los comprometidos en la línea base vigente, con su peso. Los cancelados no cuentan. | Decidido / Propuesto |
| Avance comprometido | Suma de pesos de los hitos cuya fecha comprometida ya pasó ÷ suma total de pesos × 100. | Propuesto |
| Avance real | Suma de (peso × logro) ÷ suma total de pesos × 100. Logro: 1 si está cumplido; el porcentaje reportado si está en curso o reprogramado (0 si no se reportó); 0 en otro caso. | Decidido / Propuesto |
| Desviación de proyecto | máx(0, avance comprometido − avance real), en puntos porcentuales. | Prototipo v1 |
| Sin línea base o sin hitos | Avance y desviación quedan sin dato (s/d). | Propuesto |

"Ya pasó" significa que la fecha es anterior a hoy en la zona horaria del proyecto. Mientras todos los pesos valgan 1, el resultado coincide con el conteo del prototipo, salvo que un hito en curso aporta su porcentaje reportado en lugar de un 50% fijo.

## 2. Desviación financiera

**Decidido:** el costo se compara contra el avance real.

| Concepto | Fórmula |
| --- | --- |
| Desviación financiera | (costo acumulado − presupuesto × avance real ÷ 100) ÷ presupuesto × 100, en porcentaje del presupuesto. |
| Sobreesfuerzo | (horas acumuladas − horas de la línea base) ÷ horas de la línea base × 100. Prototipo v1. |
| Sin dato | Presupuesto desconocido o cero, sin observación de costo, o avance real sin dato. Propuesto. |

El costo y las horas son los de la observación económica vigente más reciente; las observaciones son acumuladas y no se suman entre sí.

## 3. Dimensiones

Cada dimensión parte de 100, resta y se limita al rango 0 a 100. Coeficientes: **Prototipo v1**.

| Dimensión | Peso | Resta | Sin dato cuando |
| --- | --- | --- | --- |
| Desempeño | 25 | 20 por hito vencido; 8 más si es crítico; 4 por hito abierto a 3 días o menos; 1.6 por punto de desviación de proyecto (máx. 35); 5 por hito cumplido después de su fecha; 6 por hito reprogramado sin cambio aprobado. | No hay hitos. |
| Financiero | 20 | 7.5 por punto de desviación financiera positiva (máx. 75); 1.2 por punto de sobreesfuerzo (máx. 20). | La desviación financiera no tiene dato. |
| Riesgos | 20 | 22 por riesgo materializado. Por riesgo abierto: 2 × severidad; 12 si su mitigación venció; 4 si vence en 3 días o menos. | No hay riesgos. |
| Cliente | 12 | Base según el clima de la última revisión: bueno 100, con tensión 68, crítico 38, sin clima 82. Resta 10 por riesgo de cliente abierto, 6 sin contacto del cliente y 4 sin escalación. | No hay clima, ni riesgos de cliente, ni contacto. |
| Gobernanza | 13 | 30 si no hay revisiones; 3 por día de atraso respecto de la cadencia (máx. 40); 3 por día de revisión vencida (máx. 30); 10 por acción vencida; 8 por cambio propuesto sin decisión en más de 14 días; 4 por hito cumplido sin evidencia cuando se exige; 20 sin línea base. | No hay ciclo de revisión configurado. **Decidido**; el prototipo daba 40. |
| Equipo | 10 | 25 sin integrantes; 15 sin responsable técnico; 14 por riesgo de equipo abierto; 8 si la última revisión marcó cambios de equipo; 10 si el sobreesfuerzo supera 10%. | No hay integrantes ni responsable técnico. |

Severidad de un riesgo = probabilidad × impacto, cada uno de 1 a 3. Un riesgo es crítico con severidad 6 o más.

## 4. Score, topes y semáforo

| Concepto | Regla | Origen |
| --- | --- | --- |
| Promedio ponderado | Suma de (score × peso) de las dimensiones con dato ÷ suma de sus pesos. | Prototipo v1 |
| Tope | El menor de los topes activos; 100 si no hay ninguno. | Prototipo v1 |
| Score | mín(promedio ponderado, tope). | Prototipo v1 |
| Sin evaluación | Si ninguna dimensión tiene dato, no hay score ni semáforo: el proyecto aparece como "Sin evaluación". | **Decidido**; el prototipo daba 70. |
| Semáforo | 80 o más: saludable. De 60 a menos de 80: en atención. Menos de 60: en riesgo. | Prototipo v1 |

| Tope | Condición | Valor |
| --- | --- | --- |
| Desviación de proyecto | Mayor que 10 puntos | 55 |
| Desviación financiera | Mayor que 3% | 58 |
| Hito crítico vencido | Al menos uno | 50 |
| Riesgo crítico | Materializado, o crítico con mitigación vencida | 50 |
| Revisión vencida | La fecha del ciclo ya pasó | 65 |
| Cliente crítico | La última revisión reportó clima crítico | 45 |

Los umbrales son estrictos: 10 y 3 exactos no activan el tope.

## 5. Precisión y redondeo — Propuesto

- Los cálculos se hacen con decimales exactos, sin punto flotante binario.
- Los umbrales se comparan antes de redondear.
- Se guardan desviaciones, promedio, tope y score con dos decimales, redondeo a la mitad hacia arriba.
- Las restas de una dimensión usan la desviación ya guardada con dos decimales, para que el resultado pueda reproducirse a partir de lo guardado.
- En pantalla el score se muestra como entero y las desviaciones con un decimal; el semáforo se decide con el valor guardado, no con el entero mostrado.

## 6. Confianza, tendencia y pronóstico — Prototipo v1

**Confianza** (0 a 100, separada del score). Parte de 100 y resta: 45 sin ninguna revisión o con la última a más de dos cadencias; 25 a más de una cadencia; 8 a más de tres cuartos de cadencia; 8 por dimensión sin dato; 9 por cada una de las tres últimas revisiones sin soporte; 5 por expectativa sin resolver (máx. 24); 12 sin línea base. Alta desde 75, media desde 50, baja por debajo.

**Tendencia.** Diferencia entre los dos últimos cortes oficiales de ciclo: +3 o más mejora, −3 o menos se deteriora, en medio estable. Con menos de dos cortes: histórico insuficiente. Usar cortes de ciclo en lugar de los dos últimos cálculos es la corrección propuesta en RN-09.

**Pronóstico.** Presión en el horizonte de ciclos configurado: 4 por hito próximo, 4 más si es crítico, 1.2 × severidad por riesgo con mitigación próxima, 2 por acción próxima, 6 por renovación próxima; más 1.2 por punto de caída si la tendencia baja, y 8 por cada tope de desviación activo. Es determinista y explicable, no una probabilidad.

## 7. Ejemplos con resultado esperado

Sirven como casos de prueba del motor. Desde BIT-0022 todos están automatizados en `packages/health-engine`, salvo el 15 (tendencia), que llega con los cortes de ciclo.

| # | Caso | Resultado |
| --- | --- | --- |
| 1 | Cuatro hitos de peso 1; dos ya exigibles; uno cumplido y uno en curso al 40%. | Comprometido 50; real (1 + 0.4) ÷ 4 × 100 = 35; desviación 15 puntos; tope de 55 activo. |
| 2 | Igual, con pesos 3, 1, 1, 1; exigibles el de peso 3 y uno de peso 1; cumplido el de peso 3. | Comprometido 4 ÷ 6 × 100 = 66.67; real 3 ÷ 6 × 100 = 50; desviación 16.67 puntos. |
| 3 | Desviación de proyecto de exactamente 10.00. | No activa el tope. |
| 4 | Desviación de proyecto de 10.01. | Activa el tope de 55. |
| 5 | Presupuesto 100,000; avance real 50%; costo 54,000. | (54,000 − 50,000) ÷ 100,000 × 100 = 4.00%; tope de 58 activo. |
| 6 | Mismo caso con costo 53,000. | 3.00%; no activa el tope. |
| 7 | Mismo caso con costo 53,010. | 3.01%; activa el tope. |
| 8 | Presupuesto 100,000; avance real 20%; costo 50,000, a mitad del plazo. | 30.00%. Con la fórmula del prototipo habría dado 0%: el proyecto gasta sin avanzar. |
| 9 | Desempeño 80 y Financiero 60 con dato; las demás sin dato; un tope de 50 activo. | Promedio (80 × 25 + 60 × 20) ÷ 45 = 71.11; score 50.00; en riesgo. |
| 10 | Mismas dimensiones sin topes. | Score 71.11; en atención. Se muestra 71. |
| 11 | Score guardado 79.99. | En atención, aunque en pantalla se vea 80. |
| 12 | Proyecto recién creado, sin línea base, hitos, riesgos, revisiones ni ciclo. | Sin evaluación. No hay score ni semáforo; confianza baja. |
| 13 | Presupuesto desconocido. | Financiero sin dato; no entra al promedio; la confianza baja 8. |
| 14 | Dos topes activos, 55 y 50. | Tope 50. |
| 15 | Cortes oficiales de ciclo 70 y 66. | Tendencia −4: se deteriora. Tres cálculos el mismo día no son tres ciclos. |

## 8. Pendiente

- Calibrar los coeficientes con proyectos reales, por tipo de servicio.
- Quién asigna el peso de un hito y dónde se captura; hoy todos valen 1.
- Las reglas que dependen de otras decisiones: vigencia de la revisión (D02), calendario y cadencias (D03), acciones y alertas (D04), proyectos pausados o cerrados (D08).
