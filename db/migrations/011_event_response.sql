-- Cause and remediation plan for critical alerts, validated by the lead (D04, PHS-030, BIT-0024).
-- migrate:up
SET LOCAL search_path = phs, public;

-- What the PM answers to a critical alert: why it happened and how it will be remedied, or the
-- approved-change proposal that replans it. A returned response is answered with a new revision.
CREATE TABLE event_response (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project,
 event_id uuid NOT NULL,
 revision_no integer NOT NULL CHECK (revision_no > 0),
 cause text NOT NULL CHECK (btrim(cause) <> ''),
 kind text NOT NULL CHECK (kind IN ('remediation','replan')),
 plan text NOT NULL CHECK (btrim(plan) <> ''),
 change_id uuid,
 submitted_by uuid NOT NULL REFERENCES app_user,
 submitted_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (event_id, revision_no),
 UNIQUE (project_id, id),
 FOREIGN KEY (project_id, event_id) REFERENCES health_event(project_id, id),
 FOREIGN KEY (project_id, change_id) REFERENCES project_change(project_id, id),
 -- Replanning a commitment goes through an approved change, so it must name the proposal.
 CHECK ((kind = 'replan') = (change_id IS NOT NULL))
);
CREATE TABLE event_response_validation (
 response_id uuid PRIMARY KEY REFERENCES event_response,
 decision text NOT NULL CHECK (decision IN ('validated','returned')),
 validator_id uuid NOT NULL REFERENCES app_user,
 decided_at timestamptz NOT NULL DEFAULT now(),
 comment text NOT NULL CHECK (btrim(comment) <> '')
);
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON event_response
 FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON event_response_validation
 FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
GRANT SELECT ON event_response, event_response_validation TO phs_identity, phs_projects, phs_health, phs_platform;
GRANT INSERT ON event_response, event_response_validation TO phs_health;
CREATE INDEX health_task_event ON health_task(event_id) WHERE event_id IS NOT NULL;
-- dbmate records the migration in the current schema; restore the default before it does.
RESET search_path;

-- migrate:down
-- No destructive rollback: recover with a forward migration or a restored backup.
DO $$ BEGIN RAISE EXCEPTION 'This migration has no down step'; END $$;
