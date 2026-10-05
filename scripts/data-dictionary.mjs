// Builds docs/DICCIONARIO-DATOS.md from the real schema (read by scripts/data-dictionary.sql, received
// on stdin) and the descriptions in docs/diccionario/descripciones.json.
// It refuses to write when a table, column or allowed value has no description, or when a
// description names something that no longer exists, so the dictionary cannot drift from the schema.
// Usage: pnpm db:dictionary            (writes the file)
//        pnpm db:dictionary -- --check (fails if the file on disk is not up to date)
import { readFileSync, writeFileSync } from 'node:fs';

const OUTPUT = 'docs/DICCIONARIO-DATOS.md';
const schema = JSON.parse(readFileSync(0, 'utf8'));
const texts = JSON.parse(readFileSync('docs/diccionario/descripciones.json', 'utf8'));

const SERVICE = { phs_identity: 'Identidad', phs_projects: 'Proyectos', phs_health: 'Salud', phs_platform: 'Plataforma' };
const PRIVILEGE = { INSERT: 'inserta', UPDATE: 'actualiza', DELETE: 'borra' };
const TYPE = { 'timestamp with time zone': 'timestamptz', 'character varying': 'varchar' };
const type = (value) => TYPE[value] ?? value;
const clean = (sql) => sql.replace(/::(text|numeric|date|integer|bigint|jsonb|uuid)(\[\])?/g, '').replace(/\s+/g, ' ');
const cell = (value) => String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const anchor = (name) => name;

// ---- Validation: schema and descriptions must match exactly.
const problems = [];
const tables = new Map(schema.tables.map((t) => [t.name, t]));
for (const table of schema.tables) {
  const text = texts.tablas[table.name];
  if (!text) { problems.push(`Falta la descripción de la tabla ${table.name}`); continue; }
  if (!texts.modulos.includes(text.modulo)) problems.push(`${table.name}: módulo desconocido "${text.modulo}"`);
  for (const column of table.columns) {
    if (!text.columnas[column.name]) problems.push(`Falta la descripción de ${table.name}.${column.name}`);
  }
  for (const name of Object.keys(text.columnas)) {
    if (!table.columns.some((c) => c.name === name)) problems.push(`${table.name}.${name} está descrita pero no existe`);
  }
  // Columns limited to a list of values: each value needs its meaning.
  for (const constraint of table.constraints.filter((k) => k.type === 'c' && k.columns.length === 1)) {
    const match = /^CHECK \(\(\(?(\w+) = ANY \(ARRAY\[(.+?)\]\)\)\)?\)$/.exec(clean(constraint.definition));
    if (!match) continue;
    const values = [...match[2].matchAll(/'([^']*)'/g)].map((m) => m[1]);
    const meanings = text.valores?.[match[1]] ?? {};
    for (const value of values) if (!meanings[value]) problems.push(`Falta el significado de ${table.name}.${match[1]} = '${value}'`);
    for (const value of Object.keys(meanings)) if (!values.includes(value)) problems.push(`${table.name}.${match[1]} = '${value}' está descrito pero la base no lo admite`);
    table.allowed = { ...(table.allowed ?? {}), [match[1]]: values };
  }
}
for (const name of Object.keys(texts.tablas)) if (!tables.has(name)) problems.push(`La tabla ${name} está descrita pero no existe`);
if (problems.length) {
  console.error(`El diccionario no coincide con el esquema:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

// ---- Derived facts.
const pk = (table) => table.constraints.find((k) => k.type === 'p')?.columns ?? [];
// A unique constraint that contains the whole primary key adds nothing about the data: it only
// exists so other tables can reference (project_id, id). It is listed, but not marked as UK.
const technical = (table, columns) => pk(table).every((c) => columns.includes(c));
const uniques = (table) => table.constraints.filter((k) => k.type === 'u' && !technical(table, k.columns)).map((k) => k.columns);
const fks = (table) => table.constraints.filter((k) => k.type === 'f');
// In a composite key (project_id, x_id) the column that says something is x_id.
const meaningful = (fk) => (fk.columns.length > 1 ? fk.columns.filter((c) => c !== 'project_id') : fk.columns);
const isUnique = (table, columns) => [pk(table), ...uniques(table)].some((key) => key.length === columns.length && key.every((c) => columns.includes(c)));

function writers(table) {
  return Object.entries(SERVICE)
    .filter(([role]) => table.grants[role]?.length)
    .map(([role, service]) => `${service} (${table.grants[role].map((p) => PRIVILEGE[p]).filter(Boolean).join(', ')})`);
}
function protection(table) {
  const functions = table.triggers.map((t) => t.function);
  const notes = [];
  if (functions.includes('reject_history_mutation')) notes.push('Solo inserción: la base rechaza modificar o borrar filas.');
  else if (functions.includes('reject_delete')) notes.push('Sin borrado físico: la base rechaza eliminar filas.');
  const granted = Object.keys(SERVICE).flatMap((role) => table.grants[role] ?? []);
  if (!notes.length && !granted.includes('UPDATE') && !granted.includes('DELETE')) notes.push('Solo inserción por permisos: ningún servicio puede modificar ni borrar filas.');
  else if (!notes.length && !granted.includes('DELETE')) notes.push('Ningún servicio tiene permiso para borrar filas.');
  return notes;
}

// One relation per pair of tables and meaningful column.
function relations(scope) {
  const seen = new Set();
  const result = [];
  for (const table of schema.tables) {
    for (const fk of fks(table)) {
      const columns = meaningful(fk);
      const key = `${table.name}>${fk.refTable}>${columns.at(-1)}`;
      if (seen.has(key) || !scope(table.name, fk.refTable)) continue;
      seen.add(key);
      const required = columns.every((c) => table.columns.find((x) => x.name === c).notNull);
      result.push({ child: table.name, parent: fk.refTable, label: columns.at(-1), required, one: isUnique(table, columns) });
    }
  }
  return result;
}
const edge = (r) => `  ${r.parent} ${r.required ? '||' : '|o'}--${r.one ? 'o|' : 'o{'} ${r.child} : ${r.label}`;

function entity(table) {
  const keys = new Set([...pk(table), ...uniques(table).flat(), ...fks(table).flatMap((k) => k.columns)]);
  const lines = table.columns.filter((c) => keys.has(c.name)).map((c) => {
    const marks = [pk(table).includes(c.name) && 'PK', fks(table).some((k) => k.columns.includes(c.name)) && 'FK',
      uniques(table).some((u) => u.includes(c.name)) && !pk(table).includes(c.name) && 'UK'].filter(Boolean).join(', ');
    return `    ${type(c.type).replace(/[^a-z0-9]/gi, '_')} ${c.name}${marks ? ` ${marks}` : ''}`;
  });
  return `  ${table.name} {\n${lines.join('\n')}\n  }`;
}

// ---- Document.
const out = [];
const moduleOf = (name) => texts.tablas[name].modulo;
const columnCount = schema.tables.reduce((sum, t) => sum + t.columns.length, 0);
out.push('# Diccionario de datos de PHS', '');
out.push(`Describe el esquema \`phs\` de PostgreSQL tal como está en la base: ${schema.tables.length} tablas y ${columnCount} columnas, con ${schema.migrations} migraciones aplicadas (\`db/migrations\`).`, '');
out.push('**Este archivo se genera; no se edita a mano.** La estructura (tipos, claves, reglas, índices y permisos) se lee del catálogo de la base y las descripciones están en [diccionario/descripciones.json](diccionario/descripciones.json). Para actualizarlo después de una migración: describir lo nuevo en ese archivo y ejecutar `pnpm db:dictionary`. El generador se niega a escribir si falta una descripción o sobra alguna.', '');
out.push('## Cómo leerlo', '');
out.push('- **Tipos.** Los de PostgreSQL. `uuid` identifica filas; `timestamptz` es un instante con zona; `date` es un día de calendario; `numeric(p,s)` es un decimal exacto; `jsonb` es un documento JSON; `text[]` es una lista de textos.');
out.push('- **Nombres.** Una columna terminada en `_on` es una fecha de negocio (`date`); en `_at`, un instante (`timestamptz`); en `_id`, una referencia a otra tabla.');
out.push('- **Clave.** PK: clave primaria. FK: referencia a otra tabla. UK: forma parte de una restricción de unicidad.');
out.push('- **Obligatoria.** "Sí" significa que la columna no admite nulo.');
out.push('- **Quién escribe.** Los cuatro servicios comparten la base, pero cada tabla tiene permisos de escritura para uno solo, salvo las compartidas de solo inserción. Todos pueden leer todas. Los permisos se imponen con un rol de PostgreSQL por servicio.');
out.push('- **Versión (`revision`).** Varias tablas llevan un contador que aumenta en cada cambio: una edición hecha sobre una versión anterior se rechaza en lugar de pisar el cambio de otra persona.');
out.push('- **Historia.** Lo ya enviado o decidido no se modifica: se corrige con una fila nueva que referencia a la anterior. Cada tabla indica si es de solo inserción.');
out.push('- **Claves compuestas con `project_id`.** Muchas referencias incluyen el proyecto además del identificador, para que la base impida relacionar elementos de proyectos distintos.', '');

out.push('## Tablas por módulo', '');
for (const module of texts.modulos) {
  out.push(`### ${module}`, '', '| Tabla | Qué guarda | Escribe | Columnas |', '| --- | --- | --- | --- |');
  for (const table of schema.tables.filter((t) => moduleOf(t.name) === module)) {
    out.push(`| [\`${table.name}\`](#${anchor(table.name)}) | ${cell(texts.tablas[table.name].descripcion)} | ${writers(table).map((w) => w.split(' (')[0]).join(', ')} | ${table.columns.length} |`);
  }
  out.push('');
}

out.push('## Diagrama entidad-relación general', '');
out.push('Todas las tablas y sus relaciones. Para que se pueda leer se omiten las columnas y las referencias a `app_user` (quién creó, decidió o es responsable de algo), que existen en casi todas las tablas y se detallan en cada una. La etiqueta de cada relación es la columna que la establece. `||--o{`: uno a muchos obligatorio; `|o--o{`: la referencia es opcional; `--o|`: como máximo una fila hija.', '');
out.push('```mermaid', 'erDiagram', ...relations((child, parent) => parent !== 'app_user' || moduleOf(child) === 'Identidad y acceso').map(edge), '```', '');

for (const module of texts.modulos) {
  const own = schema.tables.filter((t) => moduleOf(t.name) === module);
  const names = new Set(own.map((t) => t.name));
  out.push(`## ${module}`, '');
  const inside = relations((child, parent) => names.has(child) && (parent !== 'app_user' || module === 'Identidad y acceso'));
  out.push('Diagrama del módulo con sus columnas clave. Las tablas de otros módulos aparecen solo con su nombre.', '');
  out.push('```mermaid', 'erDiagram', ...own.map(entity), ...inside.map(edge), '```', '');

  for (const table of own) {
    const text = texts.tablas[table.name];
    out.push(`### ${table.name}`, '', text.descripcion, '');
    out.push(`- **Escribe:** ${writers(table).join('; ') || 'ningún servicio'}.`);
    for (const note of protection(table)) out.push(`- **Protección:** ${note}`);
    out.push(`- **Clave primaria:** ${pk(table).map((c) => `\`${c}\``).join(', ')}.`);
    for (const note of text.notas ?? []) out.push(`- **Nota:** ${note}`);
    out.push('', '| # | Columna | Tipo | Obligatoria | Valor por defecto | Clave | Descripción |', '| --- | --- | --- | --- | --- | --- | --- |');
    table.columns.forEach((column, index) => {
      const references = fks(table).filter((k) => k.columns.includes(column.name) && meaningful(k).includes(column.name))
        .map((k) => `FK → [\`${k.refTable}\`](#${anchor(k.refTable)})`);
      const keys = [pk(table).includes(column.name) && 'PK', ...new Set(references),
        uniques(table).some((u) => u.includes(column.name)) && 'UK'].filter(Boolean).join('<br>');
      out.push(`| ${index + 1} | \`${column.name}\` | ${cell(type(column.type))} | ${column.notNull ? 'Sí' : 'No'} | ${column.default ? `\`${cell(clean(column.default))}\`` : '—'} | ${keys || '—'} | ${cell(text.columnas[column.name])} |`);
    });
    out.push('');
    if (table.allowed) {
      out.push('**Valores permitidos**', '', '| Columna | Valor | Significado |', '| --- | --- | --- |');
      for (const [column, values] of Object.entries(table.allowed)) for (const value of values) out.push(`| \`${column}\` | \`${value}\` | ${cell(text.valores[column][value])} |`);
      out.push('');
    }
    const foreign = fks(table);
    if (foreign.length) {
      out.push('**Referencias**', '', '| Columnas | Apunta a | Restricción |', '| --- | --- | --- |');
      for (const k of foreign) out.push(`| ${k.columns.map((c) => `\`${c}\``).join(', ')} | [\`${k.refTable}\`](#${anchor(k.refTable)}) (${k.refColumns.map((c) => `\`${c}\``).join(', ')}) | \`${k.name}\` |`);
      out.push('');
    }
    const unique = table.constraints.filter((k) => k.type === 'u');
    const uniqueIndexes = table.indexes.filter((i) => i.unique);
    if (unique.length || uniqueIndexes.length) {
      out.push('**Unicidad**', '');
      for (const k of unique) out.push(`- ${k.columns.map((c) => `\`${c}\``).join(', ')} (\`${k.name}\`)${technical(table, k.columns) ? ' — clave técnica para las referencias compuestas desde otras tablas' : ''}`);
      for (const i of uniqueIndexes) out.push(`- \`${cell(clean(i.definition.replace(/^CREATE UNIQUE INDEX \S+ ON \S+ USING btree /, '')))}\` (índice \`${i.name}\`)`);
      out.push('');
    }
    const checks = table.constraints.filter((k) => k.type === 'c');
    if (checks.length) {
      out.push('**Reglas que impone la base**', '');
      for (const k of checks) out.push(`- \`${cell(clean(k.definition).replace(/^CHECK \((.*)\)$/, '$1'))}\``);
      out.push('');
    }
    const plain = table.indexes.filter((i) => !i.unique);
    if (plain.length) {
      out.push('**Índices de consulta**', '');
      for (const i of plain) out.push(`- \`${i.name}\`: \`${cell(clean(i.definition.replace(/^CREATE INDEX \S+ ON \S+ USING btree /, '')))}\``);
      out.push('');
    }
  }
}

const document = `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(OUTPUT, 'utf8'); } catch { /* missing file counts as out of date */ }
  if (current !== document) {
    console.error(`${OUTPUT} no está al día con el esquema. Ejecuta: pnpm db:dictionary`);
    process.exit(1);
  }
  console.log(`${OUTPUT} está al día: ${schema.tables.length} tablas, ${columnCount} columnas`);
} else {
  writeFileSync(OUTPUT, document);
  console.log(`Escrito ${OUTPUT}: ${schema.tables.length} tablas, ${columnCount} columnas`);
}
