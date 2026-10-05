import { randomUUID } from 'node:crypto';
import { inbox as inboxSchema } from '@phs/contracts';
import { createPool, loadEnv, type ProjectCapabilities } from '@phs/service-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotificationService } from '../src/notification.service.js';
import type { ProjectsClient } from '../src/projects.client.js';

loadEnv();
const ownerUrl = process.env.OWNER_TEST_DATABASE_URL;
const serviceUrl = process.env.PLATFORM_TEST_DATABASE_URL;
const ready = Boolean(ownerUrl && serviceUrl);
const owner = ready ? createPool(ownerUrl!) : undefined;
const pool = ready ? createPool(serviceUrl!) : undefined;
const id = async (sql: string, params: unknown[]) => (await owner!.query(sql, params)).rows[0].id as string;
const VIEW: ProjectCapabilities = { view: true, editOperation: false, proposeAndReview: false, decide: false, seeFinancials: false };

afterAll(async () => { await pool?.end(); await owner?.end(); });

describe.skipIf(!ready)('outbox dispatch and in-app notifications (PHS-033, PHS-034)', () => {
  const projects = { capabilities: async (identity: string) => (identity === 'none' ? null : VIEW) } as unknown as ProjectsClient;
  const notifications = new NotificationService(pool!, projects, 0);
  let pm = ''; let lead = ''; let dev = ''; let practice = ''; let client = '';
  const as = (userId: string, identity = 'ok') => ({ userId, identity });
  const project = () => id(
    `INSERT INTO phs.project(practice_id, client_id, code, name, service_type_code, pm_id, lead_id, technical_owner_id, starts_on, ends_on)
     VALUES($1, $2, $3, 'Notificado', 'development', $4, $5, $5, '2026-01-01', '2026-12-31') RETURNING id`,
    [practice, client, `N-${randomUUID().slice(0, 8)}`, pm, lead]);
  const outbox = (projectId: string, type: string, payload: object) => id(
    'INSERT INTO phs.outbox_message(project_id, event_type, deduplication_key, payload) VALUES($1, $2, $3, $4) RETURNING id',
    [projectId, type, `${type}:${randomUUID()}`, JSON.stringify({ projectId, ...payload })]);
  // An alert with its automatic action, as the Health service leaves them.
  const alert = async (projectId: string, severity: string, title: string, dueOn: string) => {
    const event = await id(
      'INSERT INTO phs.health_event(project_id, rule_key, condition_key, episode, severity, title) VALUES($1, $2, $3, 1, $4, $5) RETURNING id',
      [projectId, 'milestone_overdue', `k:${randomUUID()}`, severity, title]);
    await id(
      `INSERT INTO phs.health_task(project_id, event_id, title, owner_id, due_on, priority, automatic, automation_key)
       VALUES($1, $2, 'Atender', $3, $4, 'high', true, $5) RETURNING id`, [projectId, event, dev, dueOn, `event:${event}`]);
    return { event, message: await outbox(projectId, 'event.opened', { eventId: event, ruleKey: 'milestone_overdue' }) };
  };

  beforeAll(async () => {
    [pm, lead, dev] = (await Promise.all(['pm', 'lead', 'dev'].map((n) =>
      id('INSERT INTO phs.app_user(display_name, email) VALUES($1, $2) RETURNING id', [n, `${n}-${randomUUID()}@example.invalid`])))) as [string, string, string];
    practice = await id('INSERT INTO phs.practice(code, name) VALUES($1, $2) RETURNING id', [`N${randomUUID().slice(0, 8)}`, 'Práctica']);
    client = await id('INSERT INTO phs.client(name) VALUES($1) RETURNING id', ['Cliente']);
  });

  it('delivers each message once to those who need it and ignores what nobody needs', async () => {
    const p = await project();
    const critical = await alert(p, 'critical', 'Hito vencido: Entrega', '2026-10-08');
    const informative = await alert(p, 'info', 'Cambio pendiente', '2026-10-12');
    const silent = await outbox(p, 'project.updated', { revision: 3 });
    expect(await notifications.dispatch(200, p)).toEqual({ processed: 3, delivered: 4, failed: 0 });
    const recipients = async (message: string) => (await owner!.query(
      'SELECT recipient_id FROM phs.notification_delivery WHERE outbox_id = $1 ORDER BY recipient_id', [message])).rows.map((r) => r.recipient_id as string);
    // Critical: owner of the action, PM and lead. Informative: only the owner.
    expect(await recipients(critical.message)).toEqual([dev, pm, lead].sort());
    expect(await recipients(informative.message)).toEqual([dev]);
    expect(await recipients(silent)).toEqual([]);
    // Nothing is waiting any more; and a redelivery of the same message creates no duplicates.
    expect(await notifications.dispatch(200, p)).toEqual({ processed: 0, delivered: 0, failed: 0 });
    await owner!.query('UPDATE phs.outbox_message SET processed_at = NULL WHERE id = $1', [critical.message]);
    expect(await notifications.dispatch(200, p)).toEqual({ processed: 1, delivered: 0, failed: 0 });
    expect(await recipients(critical.message)).toHaveLength(3);
  });

  it('a message that fails is kept for a later retry without stopping the rest', async () => {
    const p = await project();
    const broken = await outbox(p, 'event.opened', { eventId: 'esto-no-es-un-id' });
    const fine = await alert(p, 'warning', 'Mitigación vencida', '2026-10-09');
    expect(await notifications.dispatch(200, p)).toEqual({ processed: 1, delivered: 2, failed: 1 });
    const row = (await owner!.query('SELECT processed_at, attempts, last_error, available_at > now() AS later FROM phs.outbox_message WHERE id = $1', [broken])).rows[0];
    expect(row).toMatchObject({ processed_at: null, attempts: 1, later: true });
    expect(row.last_error).toContain('uuid');
    expect((await owner!.query('SELECT processed_at IS NOT NULL AS done FROM phs.outbox_message WHERE id = $1', [fine.message])).rows[0].done).toBe(true);
    // Not due yet, so the next pass leaves it alone.
    expect(await notifications.dispatch(200, p)).toEqual({ processed: 0, delivered: 0, failed: 0 });
  });

  it('the inbox orders by what needs action, criticality and deadline, within what the user may see', async () => {
    const p = await project();
    const late = await alert(p, 'critical', 'Hito vencido: B', '2026-10-20');
    const soon = await alert(p, 'critical', 'Hito vencido: A', '2026-10-08');
    const mild = await alert(p, 'warning', 'Mitigación vencida', '2026-10-01');
    const change = await id(
      `INSERT INTO phs.project_change(project_id, title, description, change_type, proposed_by, requested_impact) VALUES($1, 'Mover entrega', 'Motivo', 'internal', $2, '{}') RETURNING id`, [p, pm]);
    await outbox(p, 'change.proposed', { changeId: change });
    await notifications.dispatch(200, p);

    const mine = await notifications.inbox(as(pm));
    expect(() => inboxSchema.strict().parse(mine)).not.toThrow();
    const here = mine.items.filter((i) => i.project.id === p);
    expect(here.map((i) => i.title)).toEqual(['Hito vencido: A', 'Hito vencido: B', 'Mitigación vencida']);
    expect(here[0]).toMatchObject({ state: 'actionable', severity: 'critical', owner: { id: dev }, dueOn: '2026-10-08', tab: 'alerts', readAt: null });
    expect(mine.unread).toBeGreaterThanOrEqual(3);
    // The lead also has the change to decide; the PM who proposed it does not.
    const leads = (await notifications.inbox(as(lead))).items.filter((i) => i.project.id === p);
    expect(leads.map((i) => i.title)).toEqual(['Hito vencido: A', 'Hito vencido: B', 'Cambio por decidir: Mover entrega']);
    expect(leads[2]).toMatchObject({ state: 'actionable', tab: 'changes', owner: null });

    // Reading does not resolve anything, and nobody reads for someone else.
    const before = mine.unread;
    expect(await notifications.markRead(as(lead), here[0]!.id)).toBe(false);
    expect(await notifications.markRead(as(pm), here[0]!.id)).toBe(true);
    expect(await notifications.markRead(as(pm), here[0]!.id)).toBe(true);
    const read = await notifications.inbox(as(pm));
    expect(read.unread).toBe(before - 1);
    expect(read.items.find((i) => i.id === here[0]!.id)).toMatchObject({ state: 'actionable', readAt: expect.any(String) });
    expect((await owner!.query('SELECT resolved_at FROM phs.health_event WHERE id = $1', [soon.event])).rows[0].resolved_at).toBeNull();

    // Once the alert is resolved its notification moves to the end as attended.
    await owner!.query("UPDATE phs.health_event SET resolved_at = now(), resolution_note = 'Resuelto' WHERE id = $1", [soon.event]);
    const after = (await notifications.inbox(as(pm))).items.filter((i) => i.project.id === p);
    expect(after.map((i) => [i.title, i.state])).toEqual([['Hito vencido: B', 'actionable'], ['Mitigación vencida', 'actionable'], ['Hito vencido: A', 'attended']]);
    void late; void mild;

    // A user who can no longer see the project gets neither the items nor the count.
    expect(await notifications.inbox(as(pm, 'none'))).toEqual({ unread: 0, items: [] });
    await notifications.markRead(as(pm), 'all');
    expect((await notifications.inbox(as(pm))).unread).toBe(0);
  });
});
