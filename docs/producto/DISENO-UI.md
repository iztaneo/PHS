# Diseño de interfaz de PHS

Fecha: 2026-10-03, America/Mexico_City (BIT-0017). Decisiones de experiencia e interfaz y cómo se aplican en `apps/web`.

## Decisiones del usuario

Elegidas el 2026-10-03 entre tres direcciones presentadas (clara y sobria, oscura ejecutiva, color con marca):

1. **Dirección A, clara y sobria**, tomada del lenguaje del prototipo: fondo gris muy claro, superficies blancas, azul como único acento.
2. Debe ser **muy limpia** y **muy ejecutiva**.
3. Debe ser **responsiva**: usable en teléfono además de escritorio.
4. **Menú lateral** como navegación principal.
5. Alcance: sistema de diseño más rediseño de todas las pantallas existentes.

## Principios

- Una sola acción principal por pantalla, en azul; las demás son secundarias.
- Mucho espacio en blanco, bordes finos y sombra mínima. Sin degradados ni adornos.
- El color tiene significado: azul para acción y selección, verde para correcto, ámbar para atención, rojo para riesgo o error. Nunca se comunica un estado solo con color: siempre lo acompaña un texto (NF-06).
- Textos en español, en minúsculas tipo oración, sin signos de exclamación.
- Se confirma un guardado solo cuando el servidor lo aceptó; un error conserva lo capturado.

## Tokens

Definidos en `apps/web/src/index.css` con `@theme` de Tailwind. Se usan por nombre, nunca con valores sueltos.

| Uso | Token | Valor |
| --- | --- | --- |
| Fondo de página | `canvas` | `#f5f5f7` |
| Tarjetas y controles | `surface` | `#ffffff` |
| Fondos suaves, encabezados de tabla | `subtle` | `#f3f4f7` |
| Texto principal / secundario / de apoyo | `ink` / `ink-soft` / `muted` | `#1d1d1f` / `#3a3a3d` / `#6e6e73` |
| Bordes | `line` / `line-strong` | `#e3e3e8` / `#c9c9d1` |
| Acento | `brand` / `brand-strong` / `brand-soft` | `#0071e3` / `#005bb8` / `#eef6ff` |
| Correcto | `ok` / `ok-soft` | `#14804a` / `#eaf7ef` |
| Atención | `warn` / `warn-soft` | `#9a5b00` / `#fff5e6` |
| Riesgo o error | `bad` / `bad-soft` | `#c4281c` / `#fff0ee` |
| Radios | `card` / `control` | 16 px / 10 px |

Tipografía del sistema (SF Pro, Inter, Segoe UI). Títulos de página de 24 px, títulos de tarjeta de 16 px, cuerpo de 14 px.

## Componentes

En `apps/web/src/ui.tsx`: `Button` (primario, secundario, fantasma, peligro), `Input`, `Select`, `Textarea`, `Field`, `Card`, `Badge`, `Notice`, `PageHeader`, `Tabs`, `Empty`, `Loading` y `Facts`. Las pantallas se componen con ellos; no se escriben estilos sueltos por pantalla. Iconos de `lucide-react`.

## Estructura y adaptación

- Escritorio (1024 px o más): menú lateral fijo de 256 px con marca, secciones y cuenta; contenido centrado con ancho máximo de 1152 px.
- Teléfono y tableta: barra superior con marca y botón de menú; el menú se despliega y se cierra al elegir una sección.
- Las listas se muestran como tabla en escritorio y como tarjetas en teléfono. Los formularios pasan de dos columnas a una.
- Controles de al menos 40 px de alto para uso táctil; foco visible en todos los elementos.
- Solo se muestran en el menú las secciones que existen; las demás se añadirán con sus historias.

## Estado y límites

Aplicado a acceso, cambio de contraseña, proyectos (lista, alta, ficha, equipo, hitos, línea base), mis roles y administración. Comprobado en navegador a 1280 px y 375 px sin desborde horizontal.

Pendiente: modo oscuro (no solicitado); revisión de contraste con una herramienta; prueba con lector de pantalla; pruebas automáticas de interfaz; las pantallas de salud, portafolio y Health Center, que usarán estos mismos componentes cuando se construyan.
