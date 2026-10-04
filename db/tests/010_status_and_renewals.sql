-- Run as the migration owner after migrations 001-010; all fixtures roll back.
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
DECLARE u uuid; pr uuid; c uuid; p uuid; r uuid; l uuid;
BEGIN
 INSERT INTO app_user(display_name,email) VALUES('St','st@example.invalid') RETURNING id INTO u;
 INSERT INTO practice(code,name) VALUES('ST','St') RETURNING id INTO pr;
 INSERT INTO client(name) VALUES('Cliente') RETURNING id INTO c;
 INSERT INTO project(practice_id,client_id,code,name,service_type_code,pm_id,lead_id,technical_owner_id,starts_on,ends_on)
 VALUES(pr,c,'ST-1','St','development',u,u,u,'2026-01-01','2026-12-31') RETURNING id INTO p;
 SET LOCAL ROLE phs_projects;
 INSERT INTO phs.project_status_log(project_id,kind,from_status,to_status,reason,recorded_by)
 VALUES(p,'transition','active','paused','El cliente congeló el presupuesto',u) RETURNING id INTO l;
 INSERT INTO phs.project_status_log(project_id,kind,to_status,reason,recorded_by) VALUES(p,'justification','paused','Sigue sin presupuesto',u);
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.project_status_log(project_id,kind,from_status,to_status,reason,recorded_by) VALUES(%L,%L,%L,%L,%L,%L)',p,'transition','paused','closed','  ',u),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.project_status_log(project_id,kind,to_status,reason,recorded_by) VALUES(%L,%L,%L,%L,%L)',p,'transition','closed','Sin estado anterior',u),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.project_status_log(project_id,kind,from_status,to_status,reason,recorded_by) VALUES(%L,%L,%L,%L,%L,%L)',p,'justification','paused','paused','x',u),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.project_status_log(project_id,kind,from_status,to_status,reason,recorded_by) VALUES(%L,%L,%L,%L,%L,%L)',p,'transition','active','archived','x',u),'23514');
 INSERT INTO phs.renewal(project_id,due_on,owner_id) VALUES(p,'2026-11-30',u) RETURNING id INTO r;
 PERFORM pg_temp.expect_error(format('UPDATE phs.renewal SET status=%L WHERE id=%L','renewed',r),'23514');
 UPDATE phs.renewal SET status='renewed', closed_at=now(), outcome_note='Renovado por doce meses', revision=revision+1 WHERE id=r;
 PERFORM pg_temp.expect_error(format('DELETE FROM phs.renewal WHERE id=%L',r),'42501');
 RESET ROLE;
 PERFORM pg_temp.expect_error(format('UPDATE project_status_log SET reason=%L WHERE id=%L','otro',l),'55000');
 SET LOCAL ROLE phs_health;
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.project_status_log(project_id,kind,to_status,reason,recorded_by) VALUES(%L,%L,%L,%L,%L)',p,'justification','paused','x',u),'42501');
 RESET ROLE;
 RAISE NOTICE 'PASS: status log with reasons and renewal outcomes; 8 expected rejections';
END $$;
ROLLBACK;
