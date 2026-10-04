// Writes docs/api/<service>.openapi.json from the contracts. Run with: pnpm api:docs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApiDocuments, type ServiceName } from './documents.js';

const target = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/api');
mkdirSync(target, { recursive: true });
for (const name of Object.keys(openApiDocuments) as ServiceName[]) {
  const file = join(target, `${name}.openapi.json`);
  writeFileSync(file, `${JSON.stringify(openApiDocuments[name](), null, 2)}\n`);
  console.log(`Escrito ${file}`);
}
