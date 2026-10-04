-- Run as the migration owner after migrations 001-009; all fixtures roll back.
BEGIN;
SET search_path = phs, public;
CREATE FUNCTION pg_temp.expect_error(command text, expected_state text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text;
BEGIN
 BEGIN
  EXECUTE command;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
  IF actual_state = expected_state THEN RETURN; END IF;
  RAISE EXCEPTION 'Expected %, got %: %', expected_state,actual_state,SQLERRM;
 END;
 RAISE EXCEPTION 'Command should have failed: %',command;
END $$;
DO $$
DECLARE u uuid; pr uuid; c uuid; p uuid; m uuid; e uuid;
BEGIN
 INSERT INTO app_user(display_name,email) VALUES('Ev','ev@example.invalid') RETURNING id INTO u;
 INSERT INTO practice(code,name) VALUES('EV','Ev') RETURNING id INTO pr;
 INSERT INTO client(name) VALUES('Cliente') RETURNING id INTO c;
 INSERT INTO project(practice_id,client_id,code,name,service_type_code,pm_id,lead_id,technical_owner_id,starts_on,ends_on)
 VALUES(pr,c,'EV-1','Ev','development',u,u,u,'2026-01-01','2026-12-31') RETURNING id INTO p;
 INSERT INTO milestone(project_id,title,owner_id,due_on) VALUES(p,'Hito',u,'2026-03-01') RETURNING id INTO m;
 SET LOCAL ROLE phs_platform;
 INSERT INTO phs.evidence(project_id,milestone_id,uploaded_by,body_text) VALUES(p,m,u,'Acta firmada') RETURNING id INTO e;
 IF (SELECT addendum FROM phs.evidence WHERE id=e) THEN RAISE EXCEPTION 'Evidence is not an addendum by default'; END IF;
 INSERT INTO phs.evidence(project_id,milestone_id,uploaded_by,body_text,addendum) VALUES(p,m,u,'Aclaración posterior',true);
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.evidence_withdrawal(evidence_id,withdrawn_by,reason) VALUES(%L,%L,%L)',e,u,'  '),'23514');
 INSERT INTO phs.evidence_withdrawal(evidence_id,withdrawn_by,reason) VALUES(e,u,'Contenía datos personales');
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.evidence_withdrawal(evidence_id,withdrawn_by,reason) VALUES(%L,%L,%L)',e,u,'Otra vez'),'23505');
 PERFORM pg_temp.expect_error(format('UPDATE phs.evidence_withdrawal SET reason=%L WHERE evidence_id=%L','x',e),'42501');
 PERFORM pg_temp.expect_error(format('DELETE FROM phs.evidence WHERE id=%L',e),'42501');
 RESET ROLE;
 SET LOCAL ROLE phs_projects;
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.evidence_withdrawal(evidence_id,withdrawn_by,reason) VALUES(%L,%L,%L)',gen_random_uuid(),u,'x'),'42501');
 RESET ROLE;
 PERFORM pg_temp.expect_error(format('DELETE FROM evidence_withdrawal WHERE evidence_id=%L',e),'55000');
 RAISE NOTICE 'PASS: addendum flag and withdrawal record; 6 expected rejections';
END $$;
ROLLBACK;
