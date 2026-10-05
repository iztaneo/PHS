-- PHS non-working days for the review calendar (D03, BIT-0025). PostgreSQL 17+. Apply once after 012.
-- Holidays change every year, so they are data an administrator maintains, not rules in code.
-- migrate:up
SET LOCAL search_path = phs, public;

CREATE TABLE holiday (
 day date PRIMARY KEY,
 name text NOT NULL CHECK (btrim(name) <> ''),
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL REFERENCES app_user
);
GRANT SELECT ON holiday TO phs_identity, phs_projects, phs_health, phs_platform;
-- A day entered by mistake can be removed: the audit entry keeps who did it.
GRANT INSERT, DELETE ON holiday TO phs_health;
-- dbmate records the migration in the current schema; restore the default before it does.
RESET search_path;

-- migrate:down
-- No destructive rollback: recover with a forward migration or a restored backup.
DO $$ BEGIN RAISE EXCEPTION 'This migration has no down step'; END $$;
