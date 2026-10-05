-- PHS history of the scheduled process (PHS-033, BIT-0027). PostgreSQL 17+. Apply once after 014.
-- scheduler_run keeps the detail of the last three months; older runs are summarised here, one
-- row per day, and removed from scheduler_run in the same transaction.
-- migrate:up
SET LOCAL search_path = phs, public;

CREATE TABLE scheduler_run_daily (
 day date PRIMARY KEY,
 runs integer NOT NULL CHECK (runs > 0),
 completed integer NOT NULL CHECK (completed >= 0),
 -- Runs without a finish time: the process stopped before ending them.
 interrupted integer NOT NULL CHECK (interrupted >= 0),
 runs_with_failures integer NOT NULL CHECK (runs_with_failures >= 0),
 projects_processed bigint NOT NULL CHECK (projects_processed >= 0),
 -- Each distinct project and error of the day, with how many runs it appeared in.
 failures jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(failures) = 'array'),
 archived_at timestamptz NOT NULL DEFAULT now(),
 CHECK (completed + interrupted = runs),
 CHECK (runs_with_failures <= runs)
);
GRANT SELECT ON scheduler_run_daily TO phs_identity, phs_projects, phs_health, phs_platform;
GRANT INSERT, UPDATE ON scheduler_run_daily TO phs_health;
-- Only to remove what has just been summarised.
GRANT DELETE ON scheduler_run TO phs_health;
-- dbmate records the migration in the current schema; restore the default before it does.
RESET search_path;

-- migrate:down
-- No destructive rollback: recover with a forward migration or a restored backup.
DO $$ BEGIN RAISE EXCEPTION 'This migration has no down step'; END $$;
