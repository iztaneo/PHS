import { insertAudit, loadAccess, withTransaction } from '@phs/service-kit';
import type pg from 'pg';
import { skipHolidays } from './cadence.js';

export interface Holiday { day: string; name: string }
export type HolidayResult = Holiday[] | 'forbidden' | 'taken' | 'not_found';

// Non-working days of the review calendar (D03). They change every year, so an administrator
// maintains them; everyone else only reads them.
export class HolidayService {
  constructor(private readonly pool: pg.Pool) {}

  async list(year: number): Promise<Holiday[]> {
    const found = await this.pool.query<Holiday>(
      'SELECT day::text AS day, name FROM phs.holiday WHERE day >= make_date($1, 1, 1) AND day < make_date($1 + 1, 1, 1) ORDER BY day', [year]);
    return found.rows;
  }

  private async isAdmin(userId: string): Promise<boolean> {
    const access = await loadAccess(this.pool, userId);
    return Boolean(access?.active && access.isAdmin);
  }

  // Reviews still waiting that fell on the new holiday move to the next day that is not one.
  async add(userId: string, requestId: string, input: Holiday): Promise<HolidayResult> {
    if (!(await this.isAdmin(userId))) return 'forbidden';
    const done = await withTransaction(this.pool, async (client) => {
      const inserted = await client.query('INSERT INTO phs.holiday(day, name, created_by) VALUES($1, $2, $3) ON CONFLICT (day) DO NOTHING', [input.day, input.name, userId]);
      if (!inserted.rowCount) return false;
      const holidays = new Set((await client.query<{ day: string }>('SELECT day::text AS day FROM phs.holiday')).rows.map((r) => r.day));
      const moved = await client.query(
        `UPDATE phs.review_cycle c SET due_on = $2
          WHERE c.due_on = $1::date AND NOT EXISTS (SELECT 1 FROM phs.health_review r WHERE r.cycle_id = c.id)`,
        [input.day, skipHolidays(input.day, holidays)]);
      await insertAudit(client, { requestId, actorId: userId, action: 'holiday.added', entityType: 'holiday', entityId: input.day, after: { name: input.name, cyclesMoved: moved.rowCount ?? 0 } });
      return true;
    });
    return done ? this.list(Number(input.day.slice(0, 4))) : 'taken';
  }

  // Removing a day does not move reviews back: their dates were already communicated.
  async remove(userId: string, requestId: string, day: string): Promise<HolidayResult> {
    if (!(await this.isAdmin(userId))) return 'forbidden';
    const done = await withTransaction(this.pool, async (client) => {
      const removed = await client.query<{ name: string }>('DELETE FROM phs.holiday WHERE day = $1 RETURNING name', [day]);
      if (!removed.rowCount) return false;
      await insertAudit(client, { requestId, actorId: userId, action: 'holiday.removed', entityType: 'holiday', entityId: day, before: { name: removed.rows[0]!.name } });
      return true;
    });
    return done ? this.list(Number(day.slice(0, 4))) : 'not_found';
  }
}
