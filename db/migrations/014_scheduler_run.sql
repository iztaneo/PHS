-- PHS record of the scheduled process of the Health service (PHS-033). PostgreSQL 17+. Apply once after 013.
-- One row per run, so the application can tell when alerts and assessments were last brought up
-- to date and whether a run failed or was interrupted (no finish time).
-- migrate:up
SET LOCAL search_path = phs, public;

CREATE TABLE scheduler_run (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 projects_processed integer NOT NULL DEFAULT 0 CHECK (projects_processed >= 0),
 failures jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(failures) = 'array'),
 CHECK (finished_at IS NULL OR finished_at >= started_at)
);
CREATE INDEX scheduler_run_recent ON scheduler_run(started_at DESC);
GRANT SELECT ON scheduler_run TO phs_identity, phs_projects, phs_health, phs_platform;
GRANT INSERT, UPDATE ON scheduler_run TO phs_health;
-- dbmate records the migration in the current schema; restore the default before it does.
RESET search_path;

-- migrate:down
-- No destructive rollback: recover with a forward migration or a restored backup.
DO $$ BEGIN RAISE EXCEPTION 'This migration has no down step'; END $$;
