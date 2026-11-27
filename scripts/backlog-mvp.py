#!/usr/bin/env python3
"""Genera docs/producto/BACKLOG-MVP.md a partir del export de Jira (docs/producto/fuentes) y de la
clasificación de cada pieza frente a lo construido. Uso: python3 scripts/backlog-mvp.py"""
import csv, collections

SRC = 'docs/producto/fuentes/PHS-Jira-import-completo.csv'
OUT = 'docs/producto/BACKLOG-MVP.md'

# Estado frente a lo construido al 2026-11-26 (BIT-0043):
#   Hecho: lo construido lo cubre, salvo detalles; Parcial: existe una parte; Nuevo: no existe;
#   Cambia: existe pero el nuevo backlog pide otro comportamiento; Fuera: infraestructura, fuera del MVP;
#   Pospuesto: funcional, pero el usuario decidió hacerlo después del MVP.
# Incrementos del MVP funcional: I1 usuarios y sesiones, I2 roles y permisos, I3 catálogos y parámetros,
# I4 clientes, proyectos y línea base, I5 hitos, riesgos, revisiones y salud, I6 alertas, acciones y
# cambios, I7 Health Center, historial y auditoría. "—": no requiere trabajo en el MVP.
C = {
 # E01 Plataforma técnica
 'PLT-01': ('Fuera', '—', 'Infraestructura Azure con Bicep.'),
 'PLT-02': ('Fuera', '—', 'Front Door, WAF, App Service y APIM. Hoy el gateway cumple el papel de entrada única.'),
 'PLT-03': ('Fuera', '—', 'AKS y ACR. Hoy: procesos locales y Docker.'),
 'PLT-04': ('Fuera', '—', 'Servicios administrados de Azure.'),
 'PLT-05': ('Fuera', '—', 'Librería de puertos con implementaciones intercambiables. Se pospone con el cambio de tecnologías.'),
 'PLT-06': ('Parcial', 'I6', 'Configuración por variables de entorno. Del MVP solo se necesitan los interruptores de reloj simulado y reinicio de ambiente.'),
 'PLT-07': ('Fuera', '—', 'Azure Service Bus. Hoy el outbox lo despacha Plataforma.'),
 'PLT-08': ('Hecho', '—', 'Outbox en PostgreSQL con despacho y reintentos (BIT-0028).'),
 'PLT-09': ('Fuera', '—', 'Conectores de Azure. Hoy PostgreSQL y carpeta local.'),
 'PLT-10': ('Nuevo', 'I6', 'Reloj del sistema simulable para el MVP. El envío de correo se hace con un buzón de prueba local cuando lo pidan los avisos de usuarios.'),
 'PLT-11': ('Fuera', '—', 'OpenTelemetry y Azure Monitor.'),
 'PLT-12': ('Parcial', 'I7', 'Auditoría en la misma transacción en todos los servicios. Faltan rol, IP de origen, enmascarado declarado y la consulta (HC-06).'),
 'PLT-13': ('Parcial', '—', 'CI en GitHub Actions con compilación, pruebas, e2e y Docker. El despliegue queda fuera del MVP.'),
 # E02 Autenticación OTP
 'AUT-01': ('Pospuesto', '—', 'Hoy se entra con contraseña. Pasa a código por correo con lista blanca de dominios. Pospuesto por decisión del usuario (BIT-0044): se conserva el acceso con contraseña.'),
 'AUT-02': ('Pospuesto', '—', 'Acceso por código de un solo uso. Pospuesto por decisión del usuario (BIT-0044): se conserva el acceso con contraseña.'), 'AUT-03': ('Pospuesto', '—', 'Acceso por código de un solo uso. Pospuesto por decisión del usuario (BIT-0044): se conserva el acceso con contraseña.'), 'AUT-04': ('Pospuesto', '—', 'Acceso por código de un solo uso. Pospuesto por decisión del usuario (BIT-0044): se conserva el acceso con contraseña.'),
 'AUT-05': ('Hecho', 'I1', 'Bloqueo por contraseñas fallidas; con el acceso por código pasará a códigos fallidos. Se agregan el desbloqueo por administrador y su correo.'),
 'AUT-06': ('Parcial', 'I1', 'Hay cierre de sesión con la sesión actual; falta cerrar todas las sesiones.'),
 'AUT-07': ('Pospuesto', '—', 'Canal de correo detrás de una interfaz. Pospuesto por decisión del usuario (BIT-0044): se conserva el acceso con contraseña.'),
 'AUT-08': ('Pospuesto', '—', 'Acceso por código de un solo uso. Pospuesto por decisión del usuario (BIT-0044): se conserva el acceso con contraseña.'),
 'AUT-09': ('Pospuesto', '—', 'Hoy: cookie de sesión opaca validada por el gateway. Pasa a token de identidad y refresh con rotación. Pospuesto por decisión del usuario (BIT-0044): se conserva el acceso con contraseña.'),
 'AUT-10': ('Pospuesto', '—', 'Pantalla de acceso en dos pasos. Pospuesto por decisión del usuario (BIT-0044): se conserva el acceso con contraseña.'),
 # E03 Autorización RBAC
 'RBA-01': ('Cambia', 'I2', 'Hoy las reglas de D05 están en el código. Pasan a roles, permisos y ámbitos como datos.'),
 'RBA-02': ('Nuevo', 'I2', ''), 'RBA-03': ('Cambia', 'I2', 'Hoy: roles pm, lead y director por práctica.'),
 'RBA-04': ('Nuevo', 'I2', ''), 'RBA-05': ('Cambia', 'I2', 'Hoy el menú es fijo.'), 'RBA-06': ('Nuevo', 'I2', ''),
 'RBA-07': ('Nuevo', 'I2', ''), 'RBA-08': ('Cambia', 'I2', 'Hoy Salud y Plataforma preguntan a Proyectos.'),
 'RBA-09': ('Nuevo', 'I2', 'Caché en memoria; sin Redis.'), 'RBA-10': ('Nuevo', 'I2', ''),
 # E04 Usuarios
 'USR-01': ('Parcial', 'I1', 'Hoy: alta con correo y nombre. Faltan apellidos, puesto, práctica y lista blanca.'),
 'USR-02': ('Parcial', 'I1', 'Hay lista; faltan filtros y paginación.'),
 'USR-03': ('Parcial', 'I1', 'Falta historial por campo y control de versión.'),
 'USR-04': ('Parcial', 'I1', 'Hay desactivar y reactivar; faltan motivo, advertencia de proyectos y asignaciones suspendidas.'),
 'USR-05': ('Parcial', 'I1', 'Hay restablecer contraseña; faltan desbloquear y cerrar sesiones.'),
 'USR-06': ('Nuevo', 'I1', ''), 'USR-07': ('Nuevo', 'I1', ''),
 'USR-08': ('Parcial', 'I1', 'Tabla de usuarios existente; faltan campos, historial y versión.'),
 'USR-09': ('Nuevo', 'I1', ''),
 # E05 Catálogos
 'CAT-01': ('Parcial', 'I3', 'Hay prácticas; faltan líder y desactivación.'),
 'CAT-02': ('Cambia', 'I3', 'Hoy cadencia fija semanal, quincenal o mensual por calendario (D03). Pasa a catálogo; mensual = 30 días.'),
 'CAT-03': ('Cambia', 'I3', 'Hoy listas fijas en la base. El hito pasa de "crítico sí/no" a criticidad de cuatro niveles.'),
 'CAT-04': ('Cambia', 'I3', 'Hoy constantes del motor (reglas phf-v1). Pasan a parámetros editables y versionados.'),
 'CAT-05': ('Nuevo', 'I3', ''), 'CAT-06': ('Nuevo', 'I3', ''), 'CAT-07': ('Nuevo', 'I3', 'Sin Redis: caché en memoria.'),
 'CAT-08': ('Nuevo', 'I3', ''),
 'CAT-09': ('Cambia', 'I3', 'Hoy los estados son fijos (por ejemplo proyecto planned, active, paused, renewing, closed). Pasan a catálogo con inicial y terminales.'),
 # E06 Clientes
 'CLI-01': ('Parcial', 'I4', 'Hoy el cliente es solo un nombre.'), 'CLI-02': ('Parcial', 'I4', ''),
 'CLI-03': ('Nuevo', 'I4', 'Hoy el contacto es un texto en el proyecto.'), 'CLI-04': ('Nuevo', 'I4', ''),
 'CLI-05': ('Nuevo', 'I4', ''), 'CLI-06': ('Nuevo', 'I4', ''), 'CLI-07': ('Nuevo', 'I4', ''), 'CLI-08': ('Nuevo', 'I4', ''),
 # E07 Proyectos
 'PRJ-01': ('Parcial', 'I4', 'Falta tipo de iniciativa; el creador recibe rol pm por proyecto.'),
 'PRJ-02': ('Parcial', 'I4', 'Faltan rol del catálogo, fechas de asignación y diferencia contra lo comprometido.'),
 'PRJ-03': ('Nuevo', 'I4', ''),
 'PRJ-04': ('Cambia', 'I4', 'Hoy la línea base se publica directo. Pasa a borrador enviado a aprobación.'),
 'PRJ-05': ('Cambia', 'I4', 'Nuevo: la aprueba el líder y nunca el mismo PM (sustituye la autoaprobación del piloto).'),
 'PRJ-06': ('Cambia', 'I4', 'Hay estados con motivo (D08); pasan a catálogo y sin línea base no se ejecuta.'),
 'PRJ-07': ('Parcial', 'I4', ''), 'PRJ-08': ('Parcial', 'I4', 'Hay eventos de proyecto en el outbox.'),
 'PRJ-09': ('Hecho', 'I4', 'Lista y ficha existen; se ajustan a los nuevos campos.'),
 # E08 Hitos y riesgos
 'HYR-01': ('Parcial', 'I5', 'Falta criticidad de catálogo y forzar control de cambios tras la línea base.'),
 'HYR-02': ('Hecho', 'I5', 'Fecha comprometida y operativa (008). Falta el evento de desfase.'),
 'HYR-03': ('Cambia', 'I5', 'Hoy cerrar pide comentario; pasa a exigir evidencia solo en imagen (sustituye D09 para el cierre).'),
 'HYR-04': ('Hecho', 'I5', 'Probabilidad e impacto 1 a 3; falta origen.'),
 'HYR-05': ('Parcial', 'I5', 'Hay historial; desde la pantalla solo cambian comentario y estado.'),
 'HYR-06': ('Parcial', 'I5', 'Falta describir el impacto real y ofrecer la acción.'),
 'HYR-07': ('Nuevo', 'I5', 'Matriz de exposición.'), 'HYR-08': ('Hecho', 'I5', ''),
 'HYR-09': ('Hecho', 'I5', 'Evidencias en carpeta privada (D09). Sin Blob.'), 'HYR-10': ('Parcial', 'I5', ''),
 # E09 Revisiones
 'REV-01': ('Cambia', 'I5', 'Hoy cadencia fija; pasa a periodicidad del catálogo y validador por defecto.'),
 'REV-02': ('Hecho', 'I5', 'Health Review del prototipo (BIT-0025).'),
 'REV-03': ('Hecho', 'I5', '"Nada cambió" bloqueado; se ajusta a "compromisos vencidos sin actualizar".'),
 'REV-04': ('Cambia', 'I5', 'Hoy el soporte obligatorio bloquea el envío; pasa a permitirlo y bajar la confianza. Imágenes PNG y JPG.'),
 'REV-05': ('Cambia', 'I5', 'Hecho, salvo que el autor ya no podrá validar su propia revisión.'),
 'REV-06': ('Parcial', 'I5', 'Hay revisión vencida; faltan omitidas y validación vencida.'),
 'REV-07': ('Hecho', 'I5', ''), 'REV-08': ('Parcial', 'I5', 'Hay proceso programado; falta el reloj simulado.'),
 'REV-09': ('Parcial', 'I7', 'Se registra la duración; falta el indicador.'),
 # E10 Salud
 'HLT-01': ('Hecho', 'I5', 'Motor phf-v1; se marcará como modelo provisional.'),
 'HLT-02': ('Hecho', 'I5', 'Se conservan las fórmulas actuales (decisión del usuario); sus valores pasan a parámetros.'),
 'HLT-03': ('Hecho', 'I5', 'Confianza explicada (BIT-0026).'),
 'HLT-04': ('Hecho', 'I5', 'Tendencia entre cortes de ciclo; se conserva la regla actual.'),
 'HLT-05': ('Parcial', 'I5', 'Hoy al consultar y cada 5 minutos, no por eventos.'),
 'HLT-06': ('Hecho', 'I5', 'Falta la etiqueta de modelo provisional.'),
 'HLT-07': ('Hecho', 'I5', 'Evaluaciones inmutables en PostgreSQL.'),
 'HLT-08': ('Nuevo', 'I3', 'Pesos y umbrales editables.'),
 # E11 Alertas
 'EXP-01': ('Hecho', 'I6', 'Detección de condiciones; faltan ventanas de anticipación.'),
 'EXP-02': ('Parcial', 'I6', 'Faltan eventos "por vencer" y de acción vencida.'),
 'EXP-03': ('Hecho', 'I6', 'Bandeja y contador (BIT-0028); falta agrupar por proyecto.'),
 'EXP-04': ('Parcial', 'I6', 'Falta crear la acción prellenada desde la notificación.'),
 'EXP-05': ('Parcial', 'I6', 'Sin duplicados; faltan aviso al subir severidad y agrupación.'),
 'EXP-06': ('Nuevo', 'I6', 'Reloj simulado; cierra también AT-02.'),
 'EXP-07': ('Hecho', 'I6', ''), 'EXP-08': ('Hecho', 'I6', ''),
 # E12 Acciones
 'TSK-01': ('Cambia', 'I6', 'Hoy hay acción automática en cada alerta (D04); pasa a solo en las críticas, y crear desde alerta con formulario prellenado.'),
 'TSK-02': ('Parcial', 'I6', 'Falta vincular a hito, riesgo o revisión.'),
 'TSK-03': ('Parcial', 'I6', 'Faltan motivo de bloqueo y reasignar.'),
 'TSK-04': ('Parcial', 'I6', 'Faltan imagen de cierre y reabrir.'),
 'TSK-05': ('Parcial', 'I6', 'Faltan filtros.'), 'TSK-06': ('Parcial', 'I6', 'Se marcan vencidas; falta el evento.'),
 'TSK-07': ('Hecho', 'I6', ''), 'TSK-08': ('Parcial', 'I6', ''),
 # E13 Cambios
 'CHG-01': ('Parcial', 'I6', 'Faltan motivo de catálogo y agregar o eliminar hitos.'),
 'CHG-02': ('Nuevo', 'I6', 'Comparación lado a lado.'),
 'CHG-03': ('Cambia', 'I6', 'Hecho, salvo que quien solicita ya no podrá aprobar.'),
 'CHG-04': ('Hecho', 'I6', ''), 'CHG-05': ('Parcial', 'I6', 'Falta comparar versiones.'),
 'CHG-06': ('Hecho', 'I6', ''), 'CHG-07': ('Hecho', 'I6', ''), 'CHG-08': ('Nuevo', 'I6', ''),
 # E14 Health Center
 'HC-01': ('Hecho', 'I7', 'Inicio (BIT-0028).'), 'HC-02': ('Parcial', 'I7', 'Faltan filtros de foco.'),
 'HC-03': ('Parcial', 'I7', 'Hay revisiones por validar en Mis acciones; falta bandeja propia.'),
 'HC-04': ('Hecho', 'I7', 'Línea de tiempo (BIT-0030).'),
 'HC-05': ('Parcial', 'I7', 'Hay historial; falta la gráfica de scores.'),
 'HC-06': ('Nuevo', 'I7', 'Consulta de auditoría.'),
 'HC-07': ('Parcial', 'I7', 'Consulta directa, sin modelo de lectura por eventos.'),
 'HC-08': ('Nuevo', 'I2', 'Se resuelve con el menú por permisos.'),
 'HC-09': ('Nuevo', 'I7', 'Reinicio de ambiente de prueba.'),
}
INC = {
 'I1': 'Usuarios y sesiones', 'I2': 'Roles, permisos y menú configurables', 'I3': 'Catálogos y parámetros del PHF',
 'I4': 'Clientes, proyectos y línea base con aprobación', 'I5': 'Hitos, riesgos, revisiones y salud',
 'I6': 'Alertas, reloj simulado, acciones y cambios', 'I7': 'Health Center, historial y auditoría',
}

rows = list(csv.reader(open(SRC, encoding='utf-8')))[1:]
epics = [r for r in rows if r[0] == 'Epic']
items = [r for r in rows if r[0] != 'Epic']
key = lambda r: r[1].split(' ')[0]
missing = [key(r) for r in items if key(r) not in C]
assert not missing, missing
stat = collections.Counter(C[key(r)][0] for r in items)
out = ['# Backlog del MVP funcional', '',
 'Generado por `scripts/backlog-mvp.py` a partir del export de Jira [fuentes/PHS-Jira-import-completo.csv](fuentes/PHS-Jira-import-completo.csv), recibido el 2026-11-26. **No se edita a mano**: el estado y el incremento de cada pieza están en el script.', '',
 'Este backlog sustituye a [BACKLOG.md](BACKLOG.md) como referencia de trabajo (BIT-0043). Las decisiones que lo enmarcan están en [DECISIONES.md](DECISIONES.md), sección "Nuevo backlog (2026-11-26)".', '',
 f'**{len(items)} piezas** en {len(epics)} épicas: ' + ', '.join(f'{v} {k.lower()}' for k, v in stat.most_common()) + '.', '',
 '| Estado | Significado |', '| --- | --- |',
 '| Hecho | Lo construido lo cubre; puede requerir ajustes menores. Nada está aceptado todavía. |',
 '| Parcial | Existe una parte. |', '| Nuevo | No existe. |',
 '| Cambia | Existe, pero el nuevo backlog pide otro comportamiento; manda el nuevo backlog. |',
 '| Fuera | Infraestructura de Azure: fuera del MVP funcional por decisión del usuario. |',
 '| Pospuesto | Funcional, pero se hará después del MVP por decisión del usuario. |', '',
 '## Incrementos del MVP funcional', '', '| Incremento | Contenido | Piezas |', '| --- | --- | --- |']
for k, name in INC.items():
    n = [key(r) for r in items if C[key(r)][1] == k]
    out.append(f'| {k} | {name} | {len(n)}: {", ".join(n)} |')
out += ['', 'Se conservan además, aunque el nuevo backlog no los menciona: causa y plan validados por el líder (D04), portafolio de Dirección (D10), pausados y cerrados con justificación a 30 días (D08), días festivos, renovaciones, economía y la ayuda del modelo PHF.', '']
for e in epics:
    kids = [r for r in items if r[4] == e[3]]
    out += [f'## {e[1]}', '', e[2].split('\n')[0], '', '| Pieza | Tipo | Prioridad | Estado | Incremento | Nota |', '| --- | --- | --- | --- | --- | --- |']
    for r in kids:
        s, inc, note = C[key(r)]
        out.append(f'| {r[1]} | {"Historia" if r[0] == "Story" else "Tarea"} | {r[5]} | {s} | {inc} | {note} |')
    out.append('')
open(OUT, 'w', encoding='utf-8').write('\n'.join(out).rstrip() + '\n')
print(f'{OUT}: {len(items)} piezas; {dict(stat)}')
