-- One group role per microservice (ADR-002, PHS-004, BIT-0010): a table has a single writer service.
-- Roles are NOLOGIN; deployment creates login users as members. Requires CREATEROLE to apply.
-- migrate:up
SET LOCAL search_path = phs, public;

DO $$
DECLARE r text;
BEGIN
 FOREACH r IN ARRAY ARRAY['phs_identity','phs_projects','phs_health','phs_platform'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
   EXECUTE format('CREATE ROLE %I NOLOGIN', r);
  END IF;
 END LOOP;
END $$;

GRANT USAGE ON SCHEMA phs TO phs_identity, phs_projects, phs_health, phs_platform;

-- Every service reads the shared model, except credentials and sessions (Identity only).
GRANT SELECT ON ALL TABLES IN SCHEMA phs TO phs_identity, phs_projects, phs_health, phs_platform;
REVOKE SELECT ON user_credential, user_session FROM phs_projects, phs_health, phs_platform;

-- Shared insert-only tables, written inside each service's own transaction.
GRANT INSERT ON audit_entry, activity, outbox_message TO phs_identity, phs_projects, phs_health, phs_platform;
GRANT USAGE ON SEQUENCE audit_entry_id_seq TO phs_identity, phs_projects, phs_health, phs_platform;

GRANT INSERT, UPDATE ON app_user, practice TO phs_identity;
GRANT INSERT, UPDATE, DELETE ON practice_membership, user_credential, user_session TO phs_identity;

GRANT INSERT, UPDATE ON client, service_type, project, milestone, risk, renewal TO phs_projects;
GRANT INSERT, UPDATE, DELETE ON project_member TO phs_projects;
GRANT INSERT ON financial_observation, project_change, change_decision, baseline TO phs_projects;

GRANT INSERT, UPDATE ON review_policy, review_cycle, health_event, health_task TO phs_health;
GRANT INSERT, UPDATE, DELETE ON review_draft TO phs_health;
GRANT INSERT ON health_review, review_validation, rule_set, health_assessment TO phs_health;

GRANT INSERT ON evidence TO phs_platform;
GRANT INSERT, UPDATE ON notification_delivery TO phs_platform;
GRANT UPDATE ON outbox_message TO phs_platform;
-- dbmate records the migration in the current schema; restore the default before it does.
RESET search_path;

-- migrate:down
-- No destructive rollback: recover with a forward migration or a restored backup.
DO $$ BEGIN RAISE EXCEPTION 'This migration has no down step'; END $$;
