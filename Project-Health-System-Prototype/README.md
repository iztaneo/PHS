# Project Health System — Prototipo operativo del PHF

Prototipo navegable que implementa el **Project Health Framework** descrito en
`phf.html` (modelo y catálogo de elementos) y `flujo-phf.html` (flujo conceptual de 11 etapas).

Sin dependencias, sin base de datos y sin datos precargados. Todo el estado vive en
`localStorage` del navegador.

## Cómo abrirlo

### Opción 1 — sin Python
Abre `index.html` directamente en Chrome, Safari o Edge.

### Opción 2 — con Python
```bash
python3 app.py     # o doble clic en run.command
```
Después abre `http://localhost:8000`.

---

## Qué implementa (mapa PHF → pantalla)

| Etapa del flujo PHF | Componente | Pantalla del PHS |
|---|---|---|
| 1 · Definir | Project | **Proyectos** / **Ficha del proyecto** |
| 2 · Línea base | Baseline | **Línea base** (versionada v1, v2, …) |
| 3 · Operar | Milestone · Risk · Project Change | **Hitos**, **Riesgos**, **Cambios** |
| 4 · Observar | Health Timeline | **Health Timeline** (pasado / presente / futuro) |
| 5 · Anticipar | Expectation Engine | Bloque superior de **Health Review** |
| 6 · Revisar | Health Review | **Health Review** (formulario adaptativo, cronómetro <1 min) |
| 7 · Interpretar | Health Event | **Health Events** |
| 8 · Evaluar | Health Assessment | **Salud del proyecto** (score, dimensiones, gates, confianza, tendencia, forecast) |
| 9 · Actuar | Health Task | **Acciones** |
| 10 · Gobernar | Health Center | **Health Center** (PM / Líder / Dirección), **Portafolio**, **Alertas** |
| 11 · Aprender | Health History | **Historial** |
| Retroalimentación | Change Approval → Baseline vN+1 | **Cambios** → aprobar genera nueva línea base |

La pantalla **Modelo PHF** contiene el flujo completo y el catálogo de los 66 elementos
del framework con su definición, objetivo, valor, reglas y aplicación en el MVP.

### Modelo de salud

- **Health Score 0–100** = promedio ponderado de 6 dimensiones (desempeño de proyecto 25%,
  financiero 20%, riesgos 20%, cliente 12%, gobernanza 13%, equipo 10%), limitado por Health Gates.
- **Health Gates**: desviación de proyecto >10%, desviación financiera >3%, hito crítico vencido,
  riesgo crítico vencido o materializado, sin review dentro del ciclo, cliente crítico.
- **Desviación de proyecto** = avance comprometido − avance real (sobre la baseline vigente + cambios aprobados).
- **Desviación financiera** = costo real vs. presupuesto de la baseline, proporcional al avance del calendario.
- **Health Confidence** = actualidad de la información, dimensiones sin dato, soporte de las reviews y eventos sin atender.
- **Health Trend** = comparación del score entre ciclos (↑ → ↓).
- **Health Forecast** = presión determinística de los próximos N ciclos (hitos, riesgos, acciones, renovaciones y tendencia).
- Una dimensión sin dato suficiente se marca `s/d`: **no penaliza el score, penaliza la confianza**.

---

## Guion de prueba de la operación

1. **Perfil.** En la barra superior cambia entre **PM**, **Líder** y **Dirección**: el Health Center
   responde a una pregunta distinta en cada rol.
2. **Alta de proyecto.** *Proyectos → Crear proyecto*. Captura cliente, tipo, estado, fechas,
   PM, líder, responsable técnico, escalación y fecha de renovación.
3. **Línea base.** El sistema te lleva a *Línea base*: define alcance, esfuerzo, presupuesto,
   equipo comprometido y fechas. Es la referencia contra la que se medirá todo.
4. **Ciclo de revisión.** *Ciclo de revisión*: frecuencia (semanal / quincenal / mensual),
   próxima fecha, ventana de anticipación y las tres reglas del ciclo (evidencia obligatoria,
   validación del líder, generación automática de acciones).
5. **Hitos.** Registra entregables con fecha compromiso, responsable y marca los **críticos**
   (activan Health Gate al vencer).
6. **Riesgos.** Registra riesgos con tipo, categoría, probabilidad, impacto, owner, deadline
   de mitigación y estrategia. Usa **Seguimiento** para actualizarlos: cada cambio queda en su historia.
7. **Adelanta la fecha.** Pulsa la **fecha operativa** de la cabecera y avanza 1, 3, 7, 14 o 30 días
   (o fija una fecha exacta). El sistema recalcula todo y guarda un snapshot del score.
8. **Alertas y eventos.** El **ícono de campana** muestra las alertas ordenadas por criticidad.
   En *Health Events* verás los hechos objetivos generados (hito vencido, riesgo vencido,
   desvío de proyecto, desvío financiero, renovación, cambio de alcance).
9. **Acciones.** Cada evento crítico genera automáticamente una **Health Task** con responsable,
   plazo y prioridad. Gestiónala en *Acciones*: seguimiento, bloqueo y cierre con comentario.
   Al desaparecer la condición que la originó, el evento y su acción se cierran solos.
10. **Health Review.** En *Health Review* el sistema muestra primero **lo que esperaba que cambiara**.
    Prueba responder **“Nada cambió”** con eventos rojos abiertos: el sistema detecta la
    inconsistencia y bloquea el cierre. Atiende los eventos desde el mismo formulario,
    marca qué cambió, adjunta soporte (texto y/o imagen) y confirma. El **cronómetro** mide el KPI de <1 minuto.
11. **Validación.** Si activaste validación del líder, cambia al perfil **Líder** y entra a
    *Validaciones*: valida o devuelve (devolver genera una acción de corrección para el PM).
12. **Cambio y nueva línea base.** *Cambios → Registrar cambio* con impacto en tiempo, esfuerzo,
    costo y áreas afectadas. Al **aprobarlo** se crea la **Baseline vN+1**, se recorren los hitos
    abiertos y la diferencia deja de contar como desviación. Si lo rechazas, sigue contando.
13. **Evaluación.** *Salud del proyecto*: score, promedio ponderado vs. tope por gates,
    dimensiones, confianza, tendencia, forecast y tabla de métricas clave con sus umbrales.
14. **Gobierno.** *Portafolio* (tarjetas y tabla comparativa), *Health Timeline*, *Historial*.
15. **Reiniciar.** Al pie de la barra lateral, **Reiniciar prototipo** borra todo el estado.

### Elementos de prueba

- **Fecha operativa** (cabecera): +1 / +3 / +7 / +14 / +30 días, −1 / −7 días, fecha exacta y “Hoy”.
  Cuando la fecha está simulada el chip se muestra en ámbar.
- **Escenario de prueba** (dentro del panel de fecha, o en *Proyectos*): carga 3 proyectos
  —uno en riesgo con hito crítico vencido y cambio pendiente, uno saludable con renovación
  próxima y uno en atención sin review— para ver el modelo completo en operación.
- **Reiniciar prototipo**: vuelve a cero proyectos.

## Limitaciones del prototipo

- Todo es local al navegador: no hay backend, usuarios reales ni correo.
- El cambio de rol es una simulación de experiencia; no hay control de acceso.
- Las imágenes de soporte se guardan como data URI en `localStorage`; usa capturas ligeras.
