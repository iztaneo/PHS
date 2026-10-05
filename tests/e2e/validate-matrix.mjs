import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const matrix = JSON.parse(readFileSync(new URL('./matrix.json', import.meta.url), 'utf8'));
assert.equal(matrix.length, 21, 'the matrix must contain AT-01..AT-18 and UI-01..UI-03');
assert.equal(new Set(matrix.map((entry) => entry.id)).size, matrix.length, 'matrix IDs must be unique');
for (let number = 1; number <= 18; number += 1) {
  const id = `AT-${String(number).padStart(2, '0')}`;
  assert.ok(matrix.some((entry) => entry.id === id), `missing ${id}`);
}
for (const id of ['UI-01', 'UI-02', 'UI-03']) assert.ok(matrix.some((entry) => entry.id === id), `missing ${id}`);
for (const entry of matrix) {
  assert.ok(['complete', 'partial', 'integration', 'manual'].includes(entry.coverage), `${entry.id}: invalid coverage`);
  assert.ok(Array.isArray(entry.automated) && Array.isArray(entry.files), `${entry.id}: invalid mapping`);
  for (const file of entry.files) assert.ok(existsSync(file), `${entry.id}: missing file ${file}`);
}
console.log(`Matriz válida: ${matrix.length} filas, ${matrix.filter((entry) => entry.coverage === 'complete').length} con cobertura completa.`);
