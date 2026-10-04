-- PHS server-side sessions for local login (D06, BIT-0007). PostgreSQL 17+. Apply once after 002.
-- The cookie carries a random token; only its SHA-256 digest is stored here.
BEGIN;
SET LOCAL search_path = phs, public;

CREATE TABLE user_session (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES app_user,
 token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 -- Absolute limit; idle timeout is derived from last_seen_at by the application.
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 revoke_reason text CHECK (revoke_reason IN ('logout','password_change','user_disabled','admin')),
 ip_address inet,
 user_agent text,
 CHECK (expires_at > created_at),
 CHECK (last_seen_at >= created_at),
 CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL)),
 CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX session_active_by_user ON user_session(user_id) WHERE revoked_at IS NULL;
CREATE INDEX session_expiry ON user_session(expires_at);
COMMIT;
