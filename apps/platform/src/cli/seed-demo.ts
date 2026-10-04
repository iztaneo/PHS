// Loads demo evidence. Safe to run again: an element that already has evidence is left untouched.
// The seed is trusted: it stands in for the Projects service when asked what the uploader may do.
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { createPool, loadEnv, requireEnv, type ProjectCapabilities } from '@phs/service-kit';
import { EvidenceService } from '../evidence.service.js';
import type { ProjectsClient } from '../projects.client.js';
import { LocalStorage, resolveStorageDirectory } from '../storage.js';

loadEnv();
const pool = createPool(requireEnv('PLATFORM_DATABASE_URL'));
const all: ProjectCapabilities = { view: true, editOperation: true, proposeAndReview: true, decide: true, seeFinancials: true };
let closed = false;
const trusted = { capabilities: async () => all, target: async () => ({ capabilities: all, canAdd: true, closed }) } as unknown as ProjectsClient;
const service = new EvidenceService(pool, trusted, new LocalStorage(resolveStorageDirectory(requireEnv('EVIDENCE_DIR'))));

// A small valid PNG (solid colour), so the demo has a real image without shipping binary files.
function png(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (data: Buffer) => { let c = 0xffffffff; for (const byte of data) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const check = Buffer.alloc(4); check.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, check]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3).map((_, i) => [r, g, b][i % 3]!)]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

try {
  const find = async (sql: string, params: unknown[]) => (await pool.query<{ id: string; project_id: string; owner_id: string }>(sql, params)).rows[0];
  const has = async (column: string, id: string) => Boolean((await pool.query(`SELECT 1 FROM phs.evidence WHERE ${column} = $1 LIMIT 1`, [id])).rowCount);
  const actor = (userId: string) => ({ userId, requestId: randomUUID(), identity: 'seed' });

  const design = await find(
    `SELECT m.id, m.project_id, m.owner_id FROM phs.milestone m JOIN phs.project p ON p.id = m.project_id
      WHERE p.code = 'DEMO-001' AND m.title = 'Diseño aprobado'`, []);
  if (design && !(await has('milestone_id', design.id))) {
    const target = { projectId: design.project_id, kind: 'milestone' as const, id: design.id };
    // The milestone is already completed, so both are addenda.
    closed = true;
    await service.add(actor(design.owner_id), target, 'Acta de aprobación del diseño firmada por la directora de TI del cliente.', null);
    await service.add(actor(design.owner_id), target, 'Captura del tablero de diseño aprobado.', { name: 'diseno-aprobado.png', content: png(320, 180, [0, 113, 227]) });
    console.log('Evidencias cargadas en DEMO-001, hito «Diseño aprobado»');
  }
  const supplier = await find(
    `SELECT r.id, r.project_id, r.owner_id FROM phs.risk r JOIN phs.project p ON p.id = r.project_id
      WHERE p.code = 'DEMO-001' AND r.status = 'materialized'`, []);
  if (supplier && !(await has('risk_id', supplier.id))) {
    closed = false;
    await service.add(actor(supplier.owner_id), { projectId: supplier.project_id, kind: 'risk', id: supplier.id },
      'Correo del proveedor del 12 del mes: confirma que no entregará la API en la fecha acordada.', null);
    console.log('Evidencia cargada en DEMO-001, riesgo materializado');
  }
  console.log('Evidencias de demostración listas');
} finally {
  await pool.end();
}
