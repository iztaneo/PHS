-- Project-specific client context and committed milestone dates (PHS-010, PHS-015, BIT-0016).
-- migrate:up
SET LOCAL search_path = phs, public;

-- client.primary_contact and client.escalation_notes stay as general data of the client;
-- these two belong to one project.
ALTER TABLE project
 ADD COLUMN client_contact text NOT NULL DEFAULT '',
 ADD COLUMN escalation_notes text NOT NULL DEFAULT '';

-- due_on is the operational date. committed_due_on is the date frozen by the current baseline;
-- NULL while the milestone is not part of a baseline.
ALTER TABLE milestone ADD COLUMN committed_due_on date;
-- dbmate records the migration in the current schema; restore the default before it does.
RESET search_path;

-- migrate:down
-- No destructive rollback: recover with a forward migration or a restored backup.
DO $$ BEGIN RAISE EXCEPTION 'This migration has no down step'; END $$;
