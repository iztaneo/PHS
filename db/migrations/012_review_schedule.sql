-- PHS review schedule (D03, PHS-020). PostgreSQL 17+. Apply once after 011.
-- The policy keeps the date the schedule is anchored to: its weekday is the cut-off day of weekly
-- and fortnightly cycles, and its day of the month the one of monthly cycles.
-- migrate:up
SET LOCAL search_path = phs, public;

ALTER TABLE review_policy
 ADD COLUMN anchor_on date,
 ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN updated_by uuid REFERENCES app_user;
UPDATE review_policy SET anchor_on = CURRENT_DATE WHERE anchor_on IS NULL;
ALTER TABLE review_policy ALTER COLUMN anchor_on SET NOT NULL;
-- dbmate records the migration in the current schema; restore the default before it does.
RESET search_path;

-- migrate:down
-- No destructive rollback: recover with a forward migration or a restored backup.
DO $$ BEGIN RAISE EXCEPTION 'This migration has no down step'; END $$;
