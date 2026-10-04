import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evidence as evidenceSchema } from '@phs/contracts';
import { createPool, loadEnv, type ProjectCapabilities } from '@phs/service-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EvidenceService } from '../src/evidence.service.js';
import { MAX_FILE_BYTES, detectFileType, safeFileName } from '../src/file-type.js';
import type { ProjectsClient, TargetAccess } from '../src/projects.client.js';
import { LocalStorage } from '../src/storage.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('datos de imagen')]);
const zip = (...entries: string[]) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(entries.join('\0'), 'latin1')]);

describe('file type detection (D09)', () => {
  it('recognises accepted types from their content', () => {
    expect(detectFileType(PNG)?.extension).toBe('png');
    expect(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]))?.mime).toBe('image/jpeg');
    expect(detectFileType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]))?.extension).toBe('webp');
    expect(detectFileType(Buffer.from('%PDF-1.7 contenido'))?.extension).toBe('pdf');
    expect(detectFileType(zip('[Content_Types].xml', 'word/document.xml'))?.extension).toBe('docx');
    expect(detectFileType(zip('[Content_Types].xml', 'xl/workbook.xml'))?.extension).toBe('xlsx');
    expect(detectFileType(zip('[Content_Types].xml', 'ppt/presentation.xml'))?.extension).toBe('pptx');
  });

  it('rejects macros, plain archives, old Office formats, executables and disguised files', () => {
    expect(detectFileType(zip('[Content_Types].xml', 'word/document.xml', 'word/vbaProject.bin'))).toBeNull();
    expect(detectFileType(zip('notas.txt'))).toBeNull();
    expect(detectFileType(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBeNull();
    expect(detectFileType(Buffer.from('MZ\x90\x00ejecutable', 'latin1'))).toBeNull();
    expect(detectFileType(Buffer.from('<svg onload="alert(1)"></svg>'))).toBeNull();
    expect(detectFileType(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
  });

  it('builds a safe name with the real extension', () => {
    expect(safeFileName('../../etc/passwd', 'png')).toBe('passwd.png');
    expect(safeFileName('C:\\Users\\x\\Acta firmada.exe', 'pdf')).toBe('Acta firmada.pdf');
    expect(safeFileName('acta<script>.pdf.exe', 'pdf')).toBe('actascript.pdf.pdf');
    expect(safeFileName('', 'jpg')).toBe('evidencia.jpg');
    expect(safeFileName('Reunión ñandú 2026.png', 'png')).toBe('Reunión ñandú 2026.png');
  });
});

// Integration: fixtures by the schema owner, service with the restricted Platform role, the Projects
// service replaced by a stub that answers what the user may do.
loadEnv();
const ownerUrl = process.env.OWNER_TEST_DATABASE_URL;
const serviceUrl = process.env.PLATFORM_TEST_DATABASE_URL;
const ready = Boolean(ownerUrl && serviceUrl);
const owner = ready ? createPool(ownerUrl!) : undefined;
const pool = ready ? createPool(serviceUrl!) : undefined;
const id = async (sql: string, params: unknown[]) => (await owner!.query(sql, params)).rows[0].id as string;
const all: ProjectCapabilities = { view: true, editOperation: true, proposeAndReview: true, decide: true, seeFinancials: true };

afterAll(async () => { await pool?.end(); await owner?.end(); });

describe.skipIf(!ready)('evidence (PHS-017)', () => {
  const directory = mkdtempSync(join(tmpdir(), 'phs-evidence-'));
  let access: TargetAccess | null = { capabilities: all, canAdd: true, closed: false };
  const projects = {
    capabilities: async () => access?.capabilities ?? null,
    target: async (_i: string, _p: string, _k: string, targetId: string) => (access && targetId === milestone ? access : null),
  } as unknown as ProjectsClient;
  const service = new EvidenceService(pool!, projects, new LocalStorage(directory));
  let user = ''; let project = ''; let milestone = '';
  const actor = () => ({ userId: user, requestId: randomUUID(), identity: 'signed' });
  const target = () => ({ projectId: project, kind: 'milestone' as const, id: milestone });
  const files = () => readdirSync(directory).length;

  beforeAll(async () => {
    user = await id('INSERT INTO phs.app_user(display_name, email) VALUES($1, $2) RETURNING id', ['Evidencia', `ev-${randomUUID()}@example.invalid`]);
    const practice = await id('INSERT INTO phs.practice(code, name) VALUES($1, $2) RETURNING id', [`E${randomUUID().slice(0, 8)}`, 'Práctica']);
    const client = await id('INSERT INTO phs.client(name) VALUES($1) RETURNING id', ['Cliente']);
    project = await id(
      `INSERT INTO phs.project(practice_id, client_id, code, name, service_type_code, pm_id, lead_id, technical_owner_id, starts_on, ends_on)
       VALUES($1, $2, $3, 'Evidencias', 'development', $4, $4, $4, '2026-01-01', '2026-12-31') RETURNING id`,
      [practice, client, `E-${randomUUID().slice(0, 8)}`, user]);
    milestone = await id("INSERT INTO phs.milestone(project_id, title, owner_id, due_on) VALUES($1, 'Hito', $2, '2026-03-01') RETURNING id", [project, user]);
  });

  it('stores text and file with author, date, real type and hash, and serves the file back', async () => {
    const by = actor();
    const added = await service.add(by, target(), ' Acta de aprobación ', { name: 'captura de pantalla.exe', content: PNG });
    expect(() => evidenceSchema.strict().parse(added)).not.toThrow();
    expect(added).toMatchObject({
      text: 'Acta de aprobación', addendum: false, withdrawn: null, uploadedBy: { id: user }, target: { kind: 'milestone', id: milestone },
      file: { name: 'captura de pantalla.png', mime: 'image/png', sizeBytes: PNG.length },
    });
    const stored = (await owner!.query('SELECT sha256, object_key FROM phs.evidence WHERE id = $1', [added.id])).rows[0];
    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await service.file(actor(), added.id)).content.equals(PNG)).toBe(true);
    const audit = (await owner!.query('SELECT action, after_data FROM phs.audit_entry WHERE request_id = $1', [by.requestId])).rows[0];
    expect(audit.action).toBe('evidence.added');
    expect(JSON.stringify(audit.after_data)).not.toContain('Acta de aprobación');
    expect((await service.list(actor(), target())).map((e) => e.id)).toContain(added.id);
  });

  it('a false, empty or oversized file leaves no evidence and no file behind', async () => {
    const before = files();
    const rows = async () => Number((await owner!.query('SELECT count(*) AS n FROM phs.evidence WHERE project_id = $1', [project])).rows[0].n);
    const count = await rows();
    await expect(service.add(actor(), target(), null, { name: 'foto.png', content: Buffer.from('MZ ejecutable disfrazado') })).rejects.toMatchObject({ code: 'file_type_not_allowed' });
    await expect(service.add(actor(), target(), 'con texto', { name: 'vacio.png', content: Buffer.alloc(0) })).rejects.toMatchObject({ code: 'file_type_not_allowed' });
    await expect(service.add(actor(), target(), null, { name: 'grande.png', content: Buffer.concat([PNG, Buffer.alloc(MAX_FILE_BYTES)]) })).rejects.toMatchObject({ code: 'file_too_large' });
    await expect(service.add(actor(), target(), '   ', null)).rejects.toMatchObject({ code: 'empty_evidence' });
    // The file was stored and then the database refused the row: the file must not remain.
    await expect(service.add(actor(), { ...target(), projectId: randomUUID() }, null, { name: 'a.png', content: PNG })).rejects.toThrow();
    expect(await rows()).toBe(count);
    expect(files()).toBe(before);
  });

  it('applies permissions on every access, even with the id in hand', async () => {
    const added = await service.add(actor(), target(), null, { name: 'a.png', content: PNG });
    access = { capabilities: { ...all, editOperation: false }, canAdd: false, closed: false };
    await expect(service.add(actor(), target(), 'sin permiso', null)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(service.withdraw(actor(), added.id, 'no puedo')).rejects.toMatchObject({ code: 'forbidden' });
    expect((await service.file(actor(), added.id)).mime).toBe('image/png');
    access = null;
    await expect(service.file(actor(), added.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(service.list(actor(), target())).rejects.toMatchObject({ code: 'not_found' });
    await expect(service.add(actor(), target(), 'x', null)).rejects.toMatchObject({ code: 'not_found' });
    access = { capabilities: all, canAdd: true, closed: false };
    await expect(service.file(actor(), randomUUID())).rejects.toMatchObject({ code: 'not_found' });
  });

  it('marks evidence added after closing as an addendum, without replacing the original', async () => {
    const original = await service.add(actor(), target(), 'Evidencia del cierre', null);
    access = { capabilities: all, canAdd: true, closed: true };
    const later = await service.add(actor(), target(), 'Aclaración posterior', null);
    access = { capabilities: all, canAdd: true, closed: false };
    expect(later.addendum).toBe(true);
    const listed = await service.list(actor(), target());
    expect(listed.find((e) => e.id === original.id)).toMatchObject({ addendum: false, text: 'Evidencia del cierre' });
    await expect(owner!.query('UPDATE phs.evidence SET body_text = $2 WHERE id = $1', [original.id, 'otro'])).rejects.toMatchObject({ code: '55000' });
  });

  it('withdrawing removes the file and the content from view and keeps who, when and why', async () => {
    const added = await service.add(actor(), target(), 'Captura con datos personales', { name: 'captura.png', content: PNG });
    const before = files();
    const withdrawn = await service.withdraw(actor(), added.id, 'Contenía datos personales de un tercero');
    expect(withdrawn).toMatchObject({ text: null, file: null, withdrawn: { by: { id: user }, reason: 'Contenía datos personales de un tercero' } });
    expect(files()).toBe(before - 1);
    await expect(service.file(actor(), added.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(service.withdraw(actor(), added.id, 'otra vez')).rejects.toMatchObject({ code: 'already_withdrawn' });
    expect((await service.list(actor(), target())).find((e) => e.id === added.id)?.withdrawn?.reason).toBe('Contenía datos personales de un tercero');
  });
});
