import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { ProjectCapabilities } from '@phs/service-kit';
import type pg from 'pg';
import type { ProjectsClient } from './projects.client.js';

export interface NotificationView {
  id: string;
  type: string;
  // actionable: someone still has to do something. attended: it was already dealt with. info: nothing to do.
  state: 'actionable' | 'attended' | 'info';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  project: { id: string; code: string; name: string };
  // Who has to act, when the notification comes from an alert with an action.
  owner: { id: string; displayName: string } | null;
  dueOn: string | null;
  // Where in the project the origin is.
  tab: 'alerts' | 'reviews' | 'changes';
  sentAt: string;
  readAt: string | null;
}
export interface Inbox { unread: number; items: NotificationView[] }
export interface Actor { userId: string; identity: string }

interface Message { id: string; project_id: string | null; event_type: string; payload: Record<string, string | undefined>; attempts: number }

const SEVERITY = ['critical', 'warning', 'info'];
const STATE = ['actionable', 'info', 'attended'];

// Turns what the services publish in the outbox into in-app notifications (PHS-033, PHS-034).
// Delivery is at least once: the unique key per message, recipient and channel makes a repeated
// delivery harmless.
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly pool: pg.Pool,
    private readonly projects: ProjectsClient,
    // 0 disables the timer; a dispatch can still be asked for explicitly.
    private readonly intervalSeconds: number,
  ) {}

  onModuleInit(): void {
    if (this.intervalSeconds <= 0) return;
    const tick = () => { this.dispatch().catch((error: unknown) => console.error('Outbox dispatch failed', error)); };
    this.timer = setInterval(tick, this.intervalSeconds * 1000);
    this.timer.unref();
    setTimeout(tick, 3000).unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // Who should hear about a message. Messages nobody needs to hear about get no recipients and
  // are simply marked as processed.
  private async recipients(client: pg.PoolClient, message: Message): Promise<string[]> {
    const p = message.payload;
    let sql: string | undefined;
    let params: unknown[] = [];
    switch (message.event_type) {
      case 'event.opened':
        // The owner of the action and the PM; the lead too when it is critical. Informative events only reach the owner.
        sql = `SELECT u FROM phs.health_event e JOIN phs.project pr ON pr.id = e.project_id
                 LEFT JOIN phs.health_task t ON t.event_id = e.id AND t.automatic,
                 LATERAL unnest(ARRAY[t.owner_id, CASE WHEN e.severity <> 'info' THEN pr.pm_id END, CASE WHEN e.severity = 'critical' THEN pr.lead_id END]) u
                WHERE e.id = $1`;
        params = [p.eventId];
        break;
      case 'review.submitted':
        sql = `SELECT pr.lead_id AS u FROM phs.review_cycle c JOIN phs.project pr ON pr.id = c.project_id
                WHERE c.id = $1 AND coalesce((c.policy_snapshot->>'leadValidationRequired')::boolean, true)`;
        params = [p.cycleId];
        break;
      case 'review.returned': case 'review.validated':
        sql = 'SELECT author_id AS u FROM phs.health_review WHERE id = $1';
        params = [p.reviewId];
        break;
      case 'change.proposed':
        sql = 'SELECT pr.lead_id AS u FROM phs.project_change c JOIN phs.project pr ON pr.id = c.project_id WHERE c.id = $1';
        params = [p.changeId];
        break;
      case 'change.approved': case 'change.rejected':
        sql = 'SELECT proposed_by AS u FROM phs.project_change WHERE id = $1';
        params = [p.changeId];
        break;
      default:
        return [];
    }
    if (params[0] === undefined) return [];
    const found = await client.query<{ id: string }>(
      `SELECT DISTINCT a.id FROM (${sql}) x JOIN phs.app_user a ON a.id = x.u AND a.active`, params);
    return found.rows.map((r) => r.id);
  }

  // Processes what is waiting in the outbox. Several instances may run at once: each takes
  // different rows. A message that fails is retried later, a little further apart each time.
  // `projectId` narrows it to one project (to reprocess it, and in tests).
  async dispatch(limit = 200, projectId?: string): Promise<{ processed: number; delivered: number; failed: number }> {
    const client = await this.pool.connect();
    const result = { processed: 0, delivered: 0, failed: 0 };
    try {
      await client.query('BEGIN');
      const batch = await client.query<Message>(
        `SELECT id, project_id, event_type, payload, attempts FROM phs.outbox_message
          WHERE processed_at IS NULL AND available_at <= now() AND ($2::uuid IS NULL OR project_id = $2::uuid)
          ORDER BY created_at, id LIMIT $1 FOR UPDATE SKIP LOCKED`, [limit, projectId ?? null]);
      for (const message of batch.rows) {
        await client.query('SAVEPOINT message');
        try {
          for (const recipient of await this.recipients(client, message)) {
            const inserted = await client.query(
              `INSERT INTO phs.notification_delivery(outbox_id, recipient_id, channel, status, sent_at) VALUES($1, $2, 'in_app', 'sent', now())
               ON CONFLICT (outbox_id, recipient_id, channel) DO NOTHING`, [message.id, recipient]);
            result.delivered += inserted.rowCount ?? 0;
          }
          await client.query('UPDATE phs.outbox_message SET processed_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1', [message.id]);
          result.processed += 1;
        } catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT message');
          await client.query(
            `UPDATE phs.outbox_message SET attempts = attempts + 1, last_error = $2,
                    available_at = now() + least(attempts + 1, 30) * interval '1 minute' WHERE id = $1`,
            [message.id, (error instanceof Error ? error.message : String(error)).slice(0, 500)]);
          result.failed += 1;
        }
      }
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  // The inbox: most critical first, then by deadline; what was already dealt with goes last.
  // Only projects the user may still see are included, in the list and in the count.
  async inbox(actor: Actor): Promise<Inbox> {
    const found = await this.pool.query<{
      id: string; read_at: Date | null; sent_at: Date; event_type: string; project_id: string; code: string; name: string;
      event_title: string | null; event_severity: 'critical' | 'warning' | 'info' | null; event_resolved: boolean | null;
      owner_id: string | null; owner_name: string | null; task_due: string | null;
      cycle_due: string | null; review_decided: boolean | null; review_superseded: boolean | null;
      change_title: string | null; change_decided: boolean | null;
    }>(
      `SELECT d.id, d.read_at, d.sent_at, o.event_type, pr.id AS project_id, pr.code, pr.name,
              e.title AS event_title, e.severity AS event_severity, e.resolved_at IS NOT NULL AS event_resolved,
              t.owner_id, tu.display_name AS owner_name, t.due_on::text AS task_due,
              c.due_on::text AS cycle_due, v.review_id IS NOT NULL AS review_decided,
              EXISTS (SELECT 1 FROM phs.health_review n WHERE n.supersedes_id = r.id) AS review_superseded,
              ch.title AS change_title, EXISTS (SELECT 1 FROM phs.change_decision cd WHERE cd.change_id = ch.id) AS change_decided
         FROM phs.notification_delivery d
         JOIN phs.outbox_message o ON o.id = d.outbox_id
         JOIN phs.project pr ON pr.id = o.project_id
         LEFT JOIN phs.health_event e ON o.event_type = 'event.opened' AND e.id::text = o.payload->>'eventId'
         LEFT JOIN phs.health_task t ON t.event_id = e.id AND t.automatic
         LEFT JOIN phs.app_user tu ON tu.id = t.owner_id
         LEFT JOIN phs.review_cycle c ON c.id::text = o.payload->>'cycleId'
         LEFT JOIN phs.health_review r ON r.id::text = o.payload->>'reviewId'
         LEFT JOIN phs.review_validation v ON v.review_id = r.id
         LEFT JOIN phs.project_change ch ON ch.id::text = o.payload->>'changeId'
        WHERE d.recipient_id = $1 AND d.channel = 'in_app' AND d.status = 'sent'
        ORDER BY d.sent_at DESC LIMIT 100`, [actor.userId]);
    const access = new Map<string, ProjectCapabilities | null>();
    const items: NotificationView[] = [];
    for (const r of found.rows) {
      if (!access.has(r.project_id)) access.set(r.project_id, await this.projects.capabilities(actor.identity, r.project_id));
      if (!access.get(r.project_id)) continue;
      const base = {
        id: r.id, type: r.event_type, project: { id: r.project_id, code: r.code, name: r.name }, owner: null, dueOn: null,
        sentAt: r.sent_at.toISOString(), readAt: r.read_at?.toISOString() ?? null,
      };
      const cycle = r.cycle_due ? `ciclo del ${r.cycle_due}` : 'ciclo';
      switch (r.event_type) {
        case 'event.opened':
          if (!r.event_title) break;
          items.push({
            ...base, tab: 'alerts', severity: r.event_severity!, title: r.event_title,
            state: r.event_resolved ? 'attended' : r.event_severity === 'info' ? 'info' : 'actionable',
            owner: r.owner_id ? { id: r.owner_id, displayName: r.owner_name! } : null, dueOn: r.task_due,
          });
          break;
        case 'review.submitted':
          items.push({ ...base, tab: 'reviews', severity: 'warning', title: `Revisión por validar (${cycle})`, dueOn: null,
            state: r.review_decided || r.review_superseded ? 'attended' : 'actionable' });
          break;
        case 'review.returned':
          items.push({ ...base, tab: 'reviews', severity: 'warning', title: `Tu revisión del ${cycle} fue devuelta: hay que corregirla`,
            state: r.review_superseded ? 'attended' : 'actionable' });
          break;
        case 'review.validated':
          items.push({ ...base, tab: 'reviews', severity: 'info', title: `Tu revisión del ${cycle} fue validada`, state: 'info' });
          break;
        case 'change.proposed':
          items.push({ ...base, tab: 'changes', severity: 'warning', title: `Cambio por decidir: ${r.change_title ?? ''}`.trim(),
            state: r.change_decided ? 'attended' : 'actionable' });
          break;
        case 'change.approved': case 'change.rejected':
          items.push({ ...base, tab: 'changes', severity: 'info', state: 'info',
            title: `Tu cambio "${r.change_title ?? ''}" fue ${r.event_type === 'change.approved' ? 'aprobado' : 'rechazado'}` });
          break;
        default:
      }
    }
    items.sort((a, b) => STATE.indexOf(a.state) - STATE.indexOf(b.state)
      || SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity)
      || (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999')
      || b.sentAt.localeCompare(a.sentAt));
    return { unread: items.filter((i) => !i.readAt).length, items };
  }

  // Reading a notification only says the user saw it: the alert, action or review stays as it is.
  async markRead(actor: Actor, id: string | 'all'): Promise<boolean> {
    const updated = await this.pool.query(
      `UPDATE phs.notification_delivery SET read_at = now()
        WHERE recipient_id = $1 AND channel = 'in_app' AND read_at IS NULL AND ($2::uuid IS NULL OR id = $2::uuid)`,
      [actor.userId, id === 'all' ? null : id]);
    if (id === 'all') return true;
    if (updated.rowCount) return true;
    // Already read is fine; someone else's or unknown is not found.
    const own = await this.pool.query('SELECT 1 FROM phs.notification_delivery WHERE id = $1 AND recipient_id = $2', [id, actor.userId]);
    return Boolean(own.rowCount);
  }
}
