-- Project status history with reasons (PHS-014, D08) and renewal outcomes (PHS-013). BIT-0022.
-- migrate:up
SET LOCAL search_path = phs, public;

-- Every pause, closure or reopening keeps its reason. A justification is the explanation the PM must
-- give when a project has stayed paused or closed for a month (D08).
CREATE TABLE project_status_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project,
 kind text NOT NULL CHECK (kind IN ('transition','justification')),
 from_status text CHECK (from_status IN ('planned','active','paused','renewing','closed')),
 to_status text NOT NULL CHECK (to_status IN ('planned','active','paused','renewing','closed')),
 reason text NOT NULL CHECK (btrim(reason) <> ''),
 recorded_by uuid NOT NULL REFERENCES app_user,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((kind = 'transition') = (from_status IS NOT NULL)),
 CHECK (from_status IS DISTINCT FROM to_status)
);
CREATE INDEX project_status_log_timeline ON project_status_log(project_id, recorded_at DESC);
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON project_status_log
 FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
GRANT SELECT ON project_status_log TO phs_identity, phs_projects, phs_health, phs_platform;
GRANT INSERT ON project_status_log TO phs_projects;

-- A renewal keeps its original date; the outcome and its comment are added when it is decided.
ALTER TABLE renewal
 ADD COLUMN outcome_note text,
 ADD COLUMN closed_at timestamptz,
 ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
 ADD CONSTRAINT renewal_outcome_complete CHECK (
   (status = 'pending' AND closed_at IS NULL AND outcome_note IS NULL)
   OR (status <> 'pending' AND closed_at IS NOT NULL AND outcome_note IS NOT NULL AND btrim(outcome_note) <> ''));
-- dbmate records the migration in the current schema; restore the default before it does.
RESET search_path;

-- migrate:down
-- No destructive rollback: recover with a forward migration or a restored backup.
DO $$ BEGIN RAISE EXCEPTION 'This migration has no down step'; END $$;
