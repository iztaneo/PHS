-- Evidence policy D09 (PHS-017, BIT-0022): addenda and withdrawal with a reason.
-- migrate:up
SET LOCAL search_path = phs, public;

-- Fixed when the evidence is added: true if its target was already closed or decided.
ALTER TABLE evidence ADD COLUMN addendum boolean NOT NULL DEFAULT false;

-- evidence is append-only, so a withdrawal is a separate fact. The file is removed from storage;
-- who uploaded it, who withdrew it, when and why remain.
CREATE TABLE evidence_withdrawal (
 evidence_id uuid PRIMARY KEY REFERENCES evidence,
 withdrawn_by uuid NOT NULL REFERENCES app_user,
 withdrawn_at timestamptz NOT NULL DEFAULT now(),
 reason text NOT NULL CHECK (btrim(reason) <> '')
);
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON evidence_withdrawal
 FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
GRANT SELECT ON evidence_withdrawal TO phs_identity, phs_projects, phs_health, phs_platform;
GRANT INSERT ON evidence_withdrawal TO phs_platform;
-- dbmate records the migration in the current schema; restore the default before it does.
RESET search_path;

-- migrate:down
-- No destructive rollback: recover with a forward migration or a restored backup.
DO $$ BEGIN RAISE EXCEPTION 'This migration has no down step'; END $$;
