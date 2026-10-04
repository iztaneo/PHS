-- Run with psql -X -v ON_ERROR_STOP=1 -f ... ; all fixtures roll back.
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
DECLARE
 u uuid; pr uuid; c uuid; p uuid; p2 uuid; m uuid; b uuid; ch uuid;
 dec uuid; b2 uuid; cyc uuid; rev uuid; rs uuid; ev uuid; task uuid;
BEGIN
 INSERT INTO app_user(identity_issuer,identity_subject,display_name,email)
 VALUES('test','test-user','Test','test@example.invalid') RETURNING id INTO u;
 INSERT INTO practice(code,name) VALUES('TEST','Test') RETURNING id INTO pr;
 INSERT INTO client(name) VALUES('Test') RETURNING id INTO c;
 INSERT INTO project(practice_id,client_id,code,name,service_type_code,pm_id,lead_id,technical_owner_id,starts_on,ends_on)
 VALUES(pr,c,'TEST-1','Test','development',u,u,u,'2026-01-01','2026-12-31') RETURNING id INTO p;
 INSERT INTO project(practice_id,client_id,code,name,service_type_code,pm_id,lead_id,technical_owner_id,starts_on,ends_on)
 VALUES(pr,c,'TEST-2','Test 2','development',u,u,u,'2026-01-01','2026-12-31') RETURNING id INTO p2;
 INSERT INTO milestone(project_id,title,owner_id,due_on)
 VALUES(p,'Delivery',u,'2026-02-01') RETURNING id INTO m;
 INSERT INTO baseline(project_id,version,starts_on,ends_on,scope,budget,currency,milestone_snapshot,team_snapshot,reason,created_by)
 VALUES(p,1,'2026-01-01','2026-12-31','Scope',1000,'MXN','[]','[]','Initial',u) RETURNING id INTO b;
 UPDATE project SET current_baseline_id=b WHERE id=p;
 PERFORM pg_temp.expect_error(format('UPDATE project SET current_baseline_id=%L WHERE id=%L',b,p2),'23503');
 PERFORM pg_temp.expect_error(format('UPDATE baseline SET budget=2000 WHERE id=%L',b),'55000');
 PERFORM pg_temp.expect_error(format('DELETE FROM baseline WHERE id=%L',b),'55000');
 PERFORM pg_temp.expect_error(format('UPDATE project SET ends_on=%L WHERE id=%L','2025-01-01',p),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO evidence(project_id,milestone_id,uploaded_by,body_text) VALUES(%L,%L,%L,%L)',p2,m,u,'Bad link'),'23503');
 INSERT INTO project_change(project_id,title,description,change_type,proposed_by,requested_impact)
 VALUES(p,'Extend','Extension','internal',u,'{"days":7}') RETURNING id INTO ch;
 INSERT INTO change_decision(project_id,change_id,decision,decided_by,comment)
 VALUES(p,ch,'approved',u,'Approved') RETURNING id INTO dec;
 INSERT INTO baseline(project_id,version,previous_baseline_id,approved_decision_id,starts_on,ends_on,scope,budget,currency,milestone_snapshot,team_snapshot,reason,created_by)
 VALUES(p,2,b,dec,'2026-01-01','2027-01-07','New scope',1100,'MXN','[]','[]','Approved change',u) RETURNING id INTO b2;
 UPDATE project SET current_baseline_id=b2,revision=revision+1 WHERE id=p;
 PERFORM pg_temp.expect_error(format('INSERT INTO change_decision(project_id,change_id,decision,decided_by,comment) VALUES(%L,%L,%L,%L,%L)',p,ch,'approved',u,'Duplicate'),'23505');
 INSERT INTO review_cycle(project_id,starts_on,due_on,policy_snapshot)
 VALUES(p,'2026-02-01','2026-02-07','{"lead_validation_required":true}') RETURNING id INTO cyc;
 INSERT INTO health_review(project_id,cycle_id,revision_no,author_id,effective_on,nothing_changed,submitted_data,expectations_snapshot)
 VALUES(p,cyc,1,u,'2026-02-07',true,'{}','[]') RETURNING id INTO rev;
 INSERT INTO review_validation(review_id,decision,validator_id,comment) VALUES(rev,'returned',u,'Please correct');
 PERFORM pg_temp.expect_error(format('INSERT INTO review_validation(review_id,decision,validator_id,comment) VALUES(%L,%L,%L,%L)',rev,'validated',u,'Duplicate'),'23505');
 PERFORM pg_temp.expect_error(format('UPDATE health_review SET nothing_changed=false WHERE id=%L',rev),'55000');
 INSERT INTO rule_set(version,definition,engine_version,created_by) VALUES('test-1','{}','test',u) RETURNING id INTO rs;
 INSERT INTO health_assessment(project_id,baseline_id,rule_set_id,review_id,cycle_id,effective_on,project_revision,assessment_kind,publication,score,weighted_score,gate_cap,confidence,dimension_results,gate_results,input_snapshot,forecast,idempotency_key)
 VALUES(p,b2,rs,rev,cyc,'2026-02-07',2,'cycle','provisional',50,90,50,70,'{}','[]','{}','{}','test-assessment');
 PERFORM pg_temp.expect_error(format('INSERT INTO health_assessment(project_id,baseline_id,rule_set_id,effective_on,project_revision,assessment_kind,publication,score,weighted_score,gate_cap,confidence,dimension_results,gate_results,input_snapshot,forecast,idempotency_key) VALUES(%L,%L,%L,%L,1,%L,%L,90,90,50,70,%L,%L,%L,%L,%L)',p,b2,rs,'2026-02-07','operational','official','{}','[]','{}','{}','bad-assessment'),'23514');
 INSERT INTO health_event(project_id,rule_key,condition_key,episode,severity,title,milestone_id)
 VALUES(p,'overdue','milestone-1-overdue',1,'critical','Overdue',m) RETURNING id INTO ev;
 PERFORM pg_temp.expect_error(format('INSERT INTO health_event(project_id,rule_key,condition_key,episode,severity,title) VALUES(%L,%L,%L,2,%L,%L)',p,'overdue','milestone-1-overdue','critical','Duplicate'),'23505');
 INSERT INTO health_task(project_id,event_id,title,owner_id,due_on,priority,automatic,automation_key)
 VALUES(p,ev,'Resolve',u,'2026-02-08','high',true,'event-1-task') RETURNING id INTO task;
 PERFORM pg_temp.expect_error(format('UPDATE health_task SET status=%L WHERE id=%L','completed',task),'23514');
 UPDATE health_event SET resolved_at=now(),resolution_note='Resolved' WHERE id=ev;
 INSERT INTO health_event(project_id,rule_key,condition_key,episode,severity,title,milestone_id)
 VALUES(p,'overdue','milestone-1-overdue',2,'critical','Recurrence',m);
 IF (SELECT status FROM health_task WHERE id=task) <> 'pending' THEN
  RAISE EXCEPTION 'Resolving event must not silently complete a task';
 END IF;
 UPDATE health_task SET status='completed',closed_at=now(),closure_note='Verified' WHERE id=task;
 RAISE NOTICE 'PASS: valid workflow and 11 expected constraint failures; recurrence preserves task state';
END $$;
ROLLBACK;
