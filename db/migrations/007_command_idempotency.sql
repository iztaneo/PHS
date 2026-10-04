-- Stored results of idempotent commands (PHS-008, NF-05, BIT-0015).
-- migrate:up
SET LOCAL search_path = phs, public;

-- Insert-only for services: a retried command returns the stored result instead of running again.
CREATE TABLE command_idempotency (
 service text NOT NULL CHECK (service IN ('identity','projects','health','platform')),
 user_id uuid NOT NULL REFERENCES app_user,
 key text NOT NULL CHECK (length(key) BETWEEN 8 AND 200),
 command text NOT NULL CHECK (btrim(command) <> ''),
 request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
 response_status integer NOT NULL CHECK (response_status BETWEEN 200 AND 299),
 response_body jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (service, user_id, key)
);
CREATE INDEX command_idempotency_created ON command_idempotency(created_at);
GRANT SELECT, INSERT ON command_idempotency TO phs_identity, phs_projects, phs_health, phs_platform;
-- dbmate records the migration in the current schema; restore the default before it does.
RESET search_path;

-- migrate:down
-- No destructive rollback: recover with a forward migration or a restored backup.
DO $$ BEGIN RAISE EXCEPTION 'This migration has no down step'; END $$;
