import { insertAudit, loadAccess, withTransaction } from '@phs/service-kit';
import type pg from 'pg';

export interface ServiceType {
  code: string;
  name: string;
  active: boolean;
}

export type CatalogResult = ServiceType | 'forbidden' | 'not_found' | 'taken';

export class CatalogService {
  constructor(private readonly pool: pg.Pool) {}

  async list(): Promise<ServiceType[]> {
    const found = await this.pool.query<ServiceType>('SELECT code, name, active FROM phs.service_type ORDER BY name');
    return found.rows;
  }

  private async isAdmin(userId: string): Promise<boolean> {
    const access = await loadAccess(this.pool, userId);
    return Boolean(access?.active && access.isAdmin);
  }

  async create(userId: string, requestId: string, input: { code: string; name: string }): Promise<CatalogResult> {
    if (!(await this.isAdmin(userId))) return 'forbidden';
    return withTransaction(this.pool, async (client) => {
      const exists = await client.query('SELECT 1 FROM phs.service_type WHERE code = $1 OR name = $2', [input.code, input.name]);
      if (exists.rowCount) return 'taken';
      const inserted = await client.query<ServiceType>(
        'INSERT INTO phs.service_type(code, name) VALUES($1, $2) RETURNING code, name, active', [input.code, input.name]);
      await insertAudit(client, {
        requestId, actorId: userId, action: 'service_type.created', entityType: 'service_type', entityId: input.code,
        after: { ...input },
      });
      return inserted.rows[0]!;
    });
  }

  // Deactivating hides the type from new projects; projects already using it keep it.
  async setActive(userId: string, requestId: string, code: string, active: boolean): Promise<CatalogResult> {
    if (!(await this.isAdmin(userId))) return 'forbidden';
    return withTransaction(this.pool, async (client) => {
      const updated = await client.query<ServiceType>(
        'UPDATE phs.service_type SET active = $2 WHERE code = $1 RETURNING code, name, active', [code, active]);
      const row = updated.rows[0];
      if (!row) return 'not_found';
      await insertAudit(client, {
        requestId, actorId: userId, action: 'service_type.updated', entityType: 'service_type', entityId: code,
        after: { active },
      });
      return row;
    });
  }
}
