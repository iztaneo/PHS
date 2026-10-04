-- Administrator is a global capability, not a practice role (D05, PHS-007, BIT-0013).
-- migrate:up
SET LOCAL search_path = phs, public;

ALTER TABLE app_user ADD COLUMN is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE practice_membership DROP CONSTRAINT practice_membership_role_check;
ALTER TABLE practice_membership ADD CONSTRAINT practice_membership_role_check
 CHECK (role IN ('pm','lead','director'));
CREATE INDEX practice_membership_user ON practice_membership(user_id);
-- dbmate records the migration in the current schema; restore the default before it does.
RESET search_path;

-- migrate:down
-- No destructive rollback: recover with a forward migration or a restored backup.
DO $$ BEGIN RAISE EXCEPTION 'This migration has no down step'; END $$;
