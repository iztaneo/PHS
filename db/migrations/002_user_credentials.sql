-- PHS local identity for the MVP (D06, BIT-0006). PostgreSQL 17+. Apply once after 001.
-- Stores only a password hash; plaintext passwords never reach the database.
-- migrate:up
SET LOCAL search_path = phs, public;

-- Local users need no external provider: issuer 'local', generated subject.
ALTER TABLE app_user
 ALTER COLUMN identity_issuer SET DEFAULT 'local',
 ALTER COLUMN identity_subject SET DEFAULT gen_random_uuid()::text,
 ADD CONSTRAINT app_user_email_present CHECK (email <> '' AND email = btrim(email));
-- Email is the login name: unique regardless of case.
CREATE UNIQUE INDEX app_user_email_unique ON app_user(lower(email));

CREATE TABLE user_credential (
 user_id uuid PRIMARY KEY REFERENCES app_user,
 -- PHC string produced by the application; only Argon2id is accepted.
 password_hash text NOT NULL CHECK (password_hash ~ '^\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$'),
 must_change_password boolean NOT NULL DEFAULT true,
 password_changed_at timestamptz NOT NULL DEFAULT now(),
 failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
 locked_until timestamptz,
 last_login_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES app_user
);
-- dbmate records the migration in the current schema; restore the default before it does.
RESET search_path;

-- migrate:down
-- No destructive rollback: recover with a forward migration or a restored backup.
DO $$ BEGIN RAISE EXCEPTION 'This migration has no down step'; END $$;
