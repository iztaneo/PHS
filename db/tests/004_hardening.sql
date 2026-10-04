-- Run with psql -X -v ON_ERROR_STOP=1 -f ... after migrations 001-004; all fixtures roll back.
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
DECLARE u uuid; pr uuid; c uuid; p uuid; m uuid; r uuid; rn uuid; ev uuid; t uuid;
BEGIN
 INSERT INTO app_user(display_name,email) VALUES('Test','hardening@example.invalid') RETURNING id INTO u;
 INSERT INTO practice(code,name) VALUES('HARD','Hardening') RETURNING id INTO pr;
 INSERT INTO client(name) VALUES('Client') RETURNING id INTO c;
 INSERT INTO project(practice_id,client_id,code,name,service_type_code,pm_id,lead_id,technical_owner_id,starts_on,ends_on)
 VALUES(pr,c,'HARD-1','Project','development',u,u,u,'2026-01-01','2026-12-31') RETURNING id INTO p;
 INSERT INTO milestone(project_id,title,owner_id,due_on) VALUES(p,'Delivery',u,'2026-02-01') RETURNING id INTO m;
 INSERT INTO risk(project_id,title,risk_type,category,probability,impact,owner_id,mitigation_due_on)
 VALUES(p,'Risk','project','scope',2,2,u,'2026-03-01') RETURNING id INTO r;
 INSERT INTO renewal(project_id,due_on,owner_id) VALUES(p,'2026-11-01',u) RETURNING id INTO rn;
 INSERT INTO health_event(project_id,rule_key,condition_key,episode,severity,title) VALUES(p,'rule','cond',1,'info','Event') RETURNING id INTO ev;
 INSERT INTO health_task(project_id,title,owner_id,due_on,priority) VALUES(p,'Task',u,'2026-02-08','low') RETURNING id INTO t;

 PERFORM pg_temp.expect_error($q$INSERT INTO practice(code,name) VALUES(' ','x')$q$,'23514');
 PERFORM pg_temp.expect_error($q$INSERT INTO client(name) VALUES('')$q$,'23514');
 PERFORM pg_temp.expect_error(format('UPDATE project SET name=%L WHERE id=%L','  ',p),'23514');
 PERFORM pg_temp.expect_error(format('UPDATE milestone SET title=%L WHERE id=%L','',m),'23514');
 PERFORM pg_temp.expect_error(format('UPDATE risk SET category=%L WHERE id=%L','',r),'23514');
 PERFORM pg_temp.expect_error(format('UPDATE health_task SET title=%L WHERE id=%L','',t),'23514');
 PERFORM pg_temp.expect_error(format('UPDATE health_event SET resolved_at=now(),resolution_note=%L WHERE id=%L',' ',ev),'23514');
 PERFORM pg_temp.expect_error($q$INSERT INTO outbox_message(event_type,deduplication_key,payload,processed_at) VALUES('x','hardening','{}',now()-interval '1 day')$q$,'23514');

 PERFORM pg_temp.expect_error(format('DELETE FROM milestone WHERE id=%L',m),'55000');
 PERFORM pg_temp.expect_error(format('DELETE FROM risk WHERE id=%L',r),'55000');
 PERFORM pg_temp.expect_error(format('DELETE FROM renewal WHERE id=%L',rn),'55000');
 PERFORM pg_temp.expect_error(format('DELETE FROM health_task WHERE id=%L',t),'55000');
 PERFORM pg_temp.expect_error(format('DELETE FROM health_event WHERE id=%L',ev),'55000');
 PERFORM pg_temp.expect_error(format('DELETE FROM project WHERE id=%L',p),'55000');

 UPDATE milestone SET status='cancelled' WHERE id=m;
 UPDATE health_event SET resolved_at=now(),resolution_note='Resolved' WHERE id=ev;
 RAISE NOTICE 'PASS: status changes allowed and 14 expected rejections (8 text/date, 6 deletes)';
END $$;
ROLLBACK;
