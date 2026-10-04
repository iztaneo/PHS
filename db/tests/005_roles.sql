-- Run as the migration owner after migrations 001-005; all fixtures roll back.
BEGIN;
SET search_path = phs, public;
-- Runs a statement as a service role; expected_state NULL means it must succeed.
CREATE FUNCTION pg_temp.as_role(role_name text, command text, expected_state text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text;
BEGIN
 EXECUTE format('SET LOCAL ROLE %I', role_name);
 BEGIN
  EXECUTE command;
  actual_state := NULL;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
 END;
 RESET ROLE;
 IF actual_state IS DISTINCT FROM expected_state THEN
  RAISE EXCEPTION '% running [%]: expected %, got %', role_name, command, coalesce(expected_state,'success'), coalesce(actual_state,'success');
 END IF;
END $$;
DO $$
DECLARE
 u uuid; pr uuid; c uuid; p uuid; r text; t text; writers integer;
 h text := '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Zm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyZm8';
BEGIN
 -- Identity owns users, credentials and sessions.
 PERFORM pg_temp.as_role('phs_identity',$q$INSERT INTO phs.app_user(display_name,email) VALUES('Role','roles@example.invalid')$q$,NULL);
 SELECT id INTO u FROM app_user WHERE email='roles@example.invalid';
 PERFORM pg_temp.as_role('phs_identity',format('INSERT INTO phs.user_credential(user_id,password_hash) VALUES(%L,%L)',u,h),NULL);
 PERFORM pg_temp.as_role('phs_identity',$q$INSERT INTO phs.practice(code,name) VALUES('ROLE','Roles')$q$,NULL);
 SELECT id INTO pr FROM practice WHERE code='ROLE';
 PERFORM pg_temp.as_role('phs_identity',format('INSERT INTO phs.audit_entry(request_id,action,entity_type,entity_id) VALUES(gen_random_uuid(),%L,%L,%L)','user.create','app_user',u),NULL);
 PERFORM pg_temp.as_role('phs_identity',$q$INSERT INTO phs.client(name) VALUES('Nope')$q$,'42501');

 -- Projects owns projects and commitments, and cannot see credentials or sessions.
 PERFORM pg_temp.as_role('phs_projects',$q$INSERT INTO phs.client(name) VALUES('Client')$q$,NULL);
 SELECT id INTO c FROM client WHERE name='Client';
 PERFORM pg_temp.as_role('phs_projects',format('INSERT INTO phs.project(practice_id,client_id,code,name,service_type_code,pm_id,lead_id,technical_owner_id,starts_on,ends_on) VALUES(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)',pr,c,'ROLE-1','Project','development',u,u,u,'2026-01-01','2026-12-31'),NULL);
 SELECT id INTO p FROM project WHERE code='ROLE-1';
 PERFORM pg_temp.as_role('phs_projects','SELECT count(*) FROM phs.app_user',NULL);
 PERFORM pg_temp.as_role('phs_projects','SELECT count(*) FROM phs.user_credential','42501');
 PERFORM pg_temp.as_role('phs_projects','SELECT count(*) FROM phs.user_session','42501');
 PERFORM pg_temp.as_role('phs_projects',format('UPDATE phs.app_user SET active=false WHERE id=%L',u),'42501');
 PERFORM pg_temp.as_role('phs_projects',format('INSERT INTO phs.health_task(project_id,title,owner_id,due_on,priority) VALUES(%L,%L,%L,%L,%L)',p,'Task',u,'2026-02-08','low'),'42501');
 PERFORM pg_temp.as_role('phs_projects','TRUNCATE phs.audit_entry','42501');
 PERFORM pg_temp.as_role('phs_projects','CREATE TABLE phs.rogue(id int)','42501');

 -- Health owns reviews, assessments, events and tasks; it reads commitments but cannot change them.
 PERFORM pg_temp.as_role('phs_health',format('INSERT INTO phs.health_task(project_id,title,owner_id,due_on,priority) VALUES(%L,%L,%L,%L,%L)',p,'Task',u,'2026-02-08','low'),NULL);
 PERFORM pg_temp.as_role('phs_health',format('SELECT name FROM phs.project WHERE id=%L',p),NULL);
 PERFORM pg_temp.as_role('phs_health',format('UPDATE phs.project SET name=%L WHERE id=%L','Changed',p),'42501');
 PERFORM pg_temp.as_role('phs_health','SELECT count(*) FROM phs.user_credential','42501');

 -- Platform dispatches the outbox and stores evidence; it cannot write business tables.
 PERFORM pg_temp.as_role('phs_projects',$q$INSERT INTO phs.outbox_message(event_type,deduplication_key,payload) VALUES('project.created','roles-test','{}')$q$,NULL);
 PERFORM pg_temp.as_role('phs_platform',$q$UPDATE phs.outbox_message SET processed_at=now() WHERE deduplication_key='roles-test'$q$,NULL);
 PERFORM pg_temp.as_role('phs_projects',$q$UPDATE phs.outbox_message SET processed_at=NULL WHERE deduplication_key='roles-test'$q$,'42501');
 PERFORM pg_temp.as_role('phs_platform',$q$INSERT INTO phs.client(name) VALUES('Nope')$q$,'42501');
 PERFORM pg_temp.as_role('phs_platform','SELECT count(*) FROM phs.user_session','42501');

 -- Every table has exactly one service that may UPDATE or DELETE it, or none (append-only history).
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='phs' LOOP
  SELECT count(*) INTO writers FROM unnest(ARRAY['phs_identity','phs_projects','phs_health','phs_platform']) AS role_name
   WHERE has_table_privilege(role_name, format('phs.%I',t), 'UPDATE') OR has_table_privilege(role_name, format('phs.%I',t), 'DELETE');
  IF writers > 1 THEN RAISE EXCEPTION 'Table % has % writer services', t, writers; END IF;
 END LOOP;
 FOREACH r IN ARRAY ARRAY['phs_identity','phs_projects','phs_health','phs_platform'] LOOP
  IF (SELECT rolcanlogin OR rolsuper OR rolcreaterole FROM pg_roles WHERE rolname=r) THEN
   RAISE EXCEPTION 'Role % must be a plain NOLOGIN group', r;
  END IF;
 END LOOP;
 RAISE NOTICE 'PASS: service role grants, 12 expected permission denials and single-writer check';
END $$;
ROLLBACK;
