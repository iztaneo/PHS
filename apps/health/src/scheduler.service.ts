import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type pg from 'pg';
import type { AssessmentsService } from './assessments.service.js';
import type { GovernanceService } from './governance.service.js';

export interface RunSummary {
  startedAt: string;
  // null: the run is still going, or the process died before finishing it.
  finishedAt: string | null;
  projects: number;
  failures: number;
}
export interface SchedulerStatus { intervalSeconds: number; lastRun: RunSummary | null }

const LOCK = 'phs-health-scheduler';

// Keeps alerts, automatic actions and assessments up to date with nobody connected (PHS-033).
// Every pass does the whole job again and each step is idempotent, so a missed or interrupted
// pass is simply recovered by the next one, without duplicates.
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly pool: pg.Pool,
    private readonly governance: GovernanceService,
    private readonly assessments: AssessmentsService,
    // 0 disables the timer; a pass can still be asked for explicitly.
    private readonly intervalSeconds: number,
  ) {}

  onModuleInit(): void {
    if (this.intervalSeconds <= 0) return;
    const tick = () => { this.runOnce().catch((error: unknown) => console.error('Scheduler pass failed', error)); };
    this.timer = setInterval(tick, this.intervalSeconds * 1000);
    this.timer.unref();
    // First pass shortly after start, so a restart does not leave a whole interval uncovered.
    setTimeout(tick, 5000).unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // One pass over every project that is not closed, or only over `only` when given (to reprocess
  // some projects, and in tests). Returns 'busy' when another pass, in this or another instance
  // of the service, holds the lock.
  async runOnce(only?: string[]): Promise<RunSummary | 'busy'> {
    const lock = await this.pool.connect();
    try {
      const got = await lock.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked', [LOCK]);
      if (!got.rows[0]!.locked) return 'busy';
      try {
        const run = (await lock.query<{ id: string }>('INSERT INTO phs.scheduler_run DEFAULT VALUES RETURNING id')).rows[0]!.id;
        const projects = await lock.query<{ id: string }>(
          "SELECT id FROM phs.project WHERE status <> 'closed' AND ($1::uuid[] IS NULL OR id = ANY($1::uuid[])) ORDER BY id", [only ?? null]);
        const failures: { projectId: string; error: string }[] = [];
        for (const project of projects.rows) {
          // One project failing does not stop the others; it is recorded and retried on the next pass.
          try {
            await this.governance.sync(project.id);
            await this.assessments.materialize(project.id);
          } catch (error) {
            failures.push({ projectId: project.id, error: (error instanceof Error ? error.message : String(error)).slice(0, 300) });
          }
        }
        const done = await lock.query<{ started_at: Date; finished_at: Date }>(
          'UPDATE phs.scheduler_run SET finished_at = now(), projects_processed = $2, failures = $3 WHERE id = $1 RETURNING started_at, finished_at',
          [run, projects.rows.length - failures.length, JSON.stringify(failures)]);
        return {
          startedAt: done.rows[0]!.started_at.toISOString(), finishedAt: done.rows[0]!.finished_at.toISOString(),
          projects: projects.rows.length - failures.length, failures: failures.length,
        };
      } finally {
        await lock.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [LOCK]);
      }
    } finally {
      lock.release();
    }
  }

  async status(): Promise<SchedulerStatus> {
    const last = (await this.pool.query<{ started_at: Date; finished_at: Date | null; projects_processed: number; failures: number }>(
      `SELECT started_at, finished_at, projects_processed, jsonb_array_length(failures) AS failures
         FROM phs.scheduler_run ORDER BY started_at DESC LIMIT 1`)).rows[0];
    return {
      intervalSeconds: this.intervalSeconds,
      lastRun: last ? {
        startedAt: last.started_at.toISOString(), finishedAt: last.finished_at?.toISOString() ?? null,
        projects: last.projects_processed, failures: last.failures,
      } : null,
    };
  }
}
