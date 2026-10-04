-- Review findings from BIT-0005 (PHS-004, BIT-0010): required text, physical deletes, outbox dates.
-- migrate:up
SET LOCAL search_path = phs, public;

ALTER TABLE practice ADD CONSTRAINT practice_text_present CHECK (btrim(code) <> '' AND btrim(name) <> '');
ALTER TABLE client ADD CONSTRAINT client_name_present CHECK (btrim(name) <> '');
ALTER TABLE service_type ADD CONSTRAINT service_type_text_present CHECK (btrim(code) <> '' AND btrim(name) <> '');
ALTER TABLE project ADD CONSTRAINT project_text_present CHECK (btrim(code) <> '' AND btrim(name) <> '');
ALTER TABLE milestone ADD CONSTRAINT milestone_title_present CHECK (btrim(title) <> '');
ALTER TABLE risk ADD CONSTRAINT risk_text_present CHECK (btrim(title) <> '' AND btrim(category) <> '');
ALTER TABLE project_change ADD CONSTRAINT project_change_text_present CHECK (btrim(title) <> '' AND btrim(description) <> '');
ALTER TABLE health_event ADD CONSTRAINT health_event_text_present
 CHECK (btrim(title) <> '' AND btrim(rule_key) <> '' AND btrim(condition_key) <> ''
   AND (resolution_note IS NULL OR btrim(resolution_note) <> ''));
ALTER TABLE health_task ADD CONSTRAINT health_task_title_present CHECK (btrim(title) <> '');
ALTER TABLE outbox_message ADD CONSTRAINT outbox_processed_after_created
 CHECK (processed_at IS NULL OR processed_at >= created_at);

-- Operational rows keep their history: they change status, they are not removed.
CREATE FUNCTION reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION '% rows cannot be deleted; change their status instead', TG_TABLE_NAME USING ERRCODE = '55000';
END $$;
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['project','milestone','risk','renewal','health_event','health_task'] LOOP
  EXECUTE format('CREATE TRIGGER no_delete BEFORE DELETE ON phs.%I FOR EACH ROW EXECUTE FUNCTION phs.reject_delete()',t);
 END LOOP;
END $$;
-- dbmate records the migration in the current schema; restore the default before it does.
RESET search_path;

-- migrate:down
-- No destructive rollback: recover with a forward migration or a restored backup.
DO $$ BEGIN RAISE EXCEPTION 'This migration has no down step'; END $$;
