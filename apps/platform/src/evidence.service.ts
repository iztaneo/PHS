import { createHash, randomUUID } from 'node:crypto';
import { insertAudit, insertOutbox, withTransaction } from '@phs/service-kit';
import type pg from 'pg';
import { MAX_FILE_BYTES, detectFileType, safeFileName } from './file-type.js';
import type { ProjectsClient, TargetKind } from './projects.client.js';
import type { EvidenceStorage } from './storage.js';

export interface EvidenceView {
  id: string;
  target: { kind: TargetKind; id: string };
  text: string | null;
  file: { name: string; mime: string; sizeBytes: number } | null;
  uploadedBy: { id: string; displayName: string };
  uploadedAt: string;
  addendum: boolean;
  withdrawn: { by: { id: string; displayName: string }; at: string; reason: string } | null;
}

export interface Target { projectId: string; kind: TargetKind; id: string }
export interface Upload { name: string; content: Buffer }
export interface Actor { userId: string; requestId: string; identity: string }

export type EvidenceErrorCode =
  | 'not_found' | 'forbidden' | 'empty_evidence' | 'file_too_large' | 'file_type_not_allowed' | 'already_withdrawn';
export class EvidenceError extends Error {
  constructor(readonly code: EvidenceErrorCode) {
    super(code);
  }
}

const COLUMN = { milestone: 'milestone_id', risk: 'risk_id', change: 'change_id' } as const;

interface Row {
  id: string; milestone_id: string | null; risk_id: string | null; change_id: string | null; body_text: string | null;
  object_key: string | null; original_filename: string | null; mime_type: string | null; size_bytes: string | null;
  uploaded_by: string; uploader: string; uploaded_at: Date; addendum: boolean; project_id: string;
  withdrawn_by: string | null; withdrawer: string | null; withdrawn_at: Date | null; reason: string | null;
}

const SELECT = `
  SELECT e.id, e.project_id, e.milestone_id, e.risk_id, e.change_id, e.body_text, e.object_key, e.original_filename,
         e.mime_type, e.size_bytes, e.uploaded_by, u.display_name AS uploader, e.uploaded_at, e.addendum,
         w.withdrawn_by, wu.display_name AS withdrawer, w.withdrawn_at, w.reason
    FROM phs.evidence e
    JOIN phs.app_user u ON u.id = e.uploaded_by
    LEFT JOIN phs.evidence_withdrawal w ON w.evidence_id = e.id
    LEFT JOIN phs.app_user wu ON wu.id = w.withdrawn_by`;

function toView(r: Row): EvidenceView {
  const kind: TargetKind = r.milestone_id ? 'milestone' : r.risk_id ? 'risk' : 'change';
  const withdrawn = r.withdrawn_at !== null;
  return {
    id: r.id, target: { kind, id: (r.milestone_id ?? r.risk_id ?? r.change_id)! },
    // Withdrawn content is no longer served; the record of the withdrawal is.
    text: withdrawn ? null : r.body_text,
    file: withdrawn || !r.object_key ? null : { name: r.original_filename!, mime: r.mime_type!, sizeBytes: Number(r.size_bytes) },
    uploadedBy: { id: r.uploaded_by, displayName: r.uploader }, uploadedAt: r.uploaded_at.toISOString(), addendum: r.addendum,
    withdrawn: withdrawn ? { by: { id: r.withdrawn_by!, displayName: r.withdrawer! }, at: r.withdrawn_at!.toISOString(), reason: r.reason! } : null,
  };
}

export class EvidenceService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly projects: ProjectsClient,
    private readonly storage: EvidenceStorage,
  ) {}

  async list(actor: Actor, target: Target): Promise<EvidenceView[]> {
    if (!(await this.projects.target(actor.identity, target.projectId, target.kind, target.id))) throw new EvidenceError('not_found');
    const found = await this.pool.query<Row>(
      `${SELECT} WHERE e.project_id = $1 AND e.${COLUMN[target.kind]} = $2 ORDER BY e.uploaded_at`, [target.projectId, target.id]);
    return found.rows.map(toView);
  }

  async add(actor: Actor, target: Target, text: string | null, upload: Upload | null): Promise<EvidenceView> {
    const access = await this.projects.target(actor.identity, target.projectId, target.kind, target.id);
    if (!access) throw new EvidenceError('not_found');
    if (!access.canAdd) throw new EvidenceError('forbidden');
    const body = text?.trim() || null;
    if (!body && !upload) throw new EvidenceError('empty_evidence');

    let file: { key: string; name: string; mime: string; size: number; sha256: string } | null = null;
    if (upload) {
      if (upload.content.length === 0) throw new EvidenceError('file_type_not_allowed');
      if (upload.content.length > MAX_FILE_BYTES) throw new EvidenceError('file_too_large');
      const type = detectFileType(upload.content);
      if (!type) throw new EvidenceError('file_type_not_allowed');
      file = {
        key: randomUUID(), name: safeFileName(upload.name, type.extension), mime: type.mime, size: upload.content.length,
        sha256: createHash('sha256').update(upload.content).digest('hex'),
      };
      await this.storage.put(file.key, upload.content);
    }
    try {
      return await withTransaction(this.pool, async (client) => {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO phs.evidence(project_id, ${COLUMN[target.kind]}, uploaded_by, body_text, object_key, original_filename,
                                    mime_type, size_bytes, sha256, addendum)
           VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [target.projectId, target.id, actor.userId, body, file?.key ?? null, file?.name ?? null, file?.mime ?? null,
            file?.size ?? null, file?.sha256 ?? null, access.closed]);
        const id = inserted.rows[0]!.id;
        // The audit entry names the evidence, never its content.
        await insertAudit(client, {
          requestId: actor.requestId, actorId: actor.userId, action: access.closed ? 'evidence.addendum_added' : 'evidence.added',
          entityType: 'evidence', entityId: id, projectId: target.projectId,
          after: { target: target.kind, targetId: target.id, hasText: body !== null, mime: file?.mime ?? null, sizeBytes: file?.size ?? null },
        });
        await insertOutbox(client, {
          projectId: target.projectId, eventType: 'evidence.added', deduplicationKey: `evidence.added:${id}`,
          payload: { projectId: target.projectId, evidenceId: id, target: target.kind, targetId: target.id },
        });
        return toView((await client.query<Row>(`${SELECT} WHERE e.id = $1`, [id])).rows[0]!);
      });
    } catch (error) {
      // No evidence row was committed: the stored file would be an orphan.
      if (file) await this.storage.delete(file.key).catch(() => undefined);
      throw error;
    }
  }

  private async visible(actor: Actor, evidenceId: string): Promise<Row> {
    const row = (await this.pool.query<Row>(`${SELECT} WHERE e.id = $1`, [evidenceId])).rows[0];
    // Same answer for "does not exist" and "not yours".
    if (!row || !(await this.projects.capabilities(actor.identity, row.project_id))) throw new EvidenceError('not_found');
    return row;
  }

  async file(actor: Actor, evidenceId: string): Promise<{ name: string; mime: string; content: Buffer }> {
    const row = await this.visible(actor, evidenceId);
    const content = row.object_key && row.withdrawn_at === null ? await this.storage.get(row.object_key) : null;
    if (!content) throw new EvidenceError('not_found');
    return { name: row.original_filename!, mime: row.mime_type!, content };
  }

  async withdraw(actor: Actor, evidenceId: string, reason: string): Promise<EvidenceView> {
    const row = await this.visible(actor, evidenceId);
    const capabilities = await this.projects.capabilities(actor.identity, row.project_id);
    if (!capabilities?.editOperation) throw new EvidenceError('forbidden');
    const view = await withTransaction(this.pool, async (client) => {
      const inserted = await client.query(
        'INSERT INTO phs.evidence_withdrawal(evidence_id, withdrawn_by, reason) VALUES($1, $2, $3) ON CONFLICT (evidence_id) DO NOTHING',
        [evidenceId, actor.userId, reason]);
      if (!inserted.rowCount) throw new EvidenceError('already_withdrawn');
      await insertAudit(client, {
        requestId: actor.requestId, actorId: actor.userId, action: 'evidence.withdrawn', entityType: 'evidence',
        entityId: evidenceId, projectId: row.project_id, after: { reason },
      });
      return toView((await client.query<Row>(`${SELECT} WHERE e.id = $1`, [evidenceId])).rows[0]!);
    });
    // After the record is committed: a failure here leaves a file nobody can reach, never a visible one.
    if (row.object_key) await this.storage.delete(row.object_key);
    return view;
  }
}
