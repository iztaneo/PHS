-- Run as the migration owner after migrations 001-012; all fixtures roll back.
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
DECLARE u uuid; pr uuid; c uuid; p uuid; cy uuid; rv uuid;
BEGIN
 INSERT INTO app_user(display_name,email) VALUES('Rs','rs@example.invalid') RETURNING id INTO u;
 INSERT INTO practice(code,name) VALUES('RS','Rs') RETURNING id INTO pr;
 INSERT INTO client(name) VALUES('Cliente') RETURNING id INTO c;
 INSERT INTO project(practice_id,client_id,code,name,service_type_code,pm_id,lead_id,technical_owner_id,starts_on,ends_on)
 VALUES(pr,c,'RS-1','Rs','development',u,u,u,'2026-01-01','2026-12-31') RETURNING id INTO p;
 SET LOCAL ROLE phs_health;
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.review_policy(project_id,cadence) VALUES(%L,%L)',p,'weekly'),'23502');
 INSERT INTO phs.review_policy(project_id,cadence,anchor_on,updated_by) VALUES(p,'weekly','2026-10-09',u);
 UPDATE phs.review_policy SET cadence='monthly', anchor_on='2026-10-31', revision=revision+1 WHERE project_id=p;
 PERFORM pg_temp.expect_error(format('UPDATE phs.review_policy SET revision=0 WHERE project_id=%L',p),'23514');
 INSERT INTO phs.review_cycle(project_id,starts_on,due_on,policy_snapshot) VALUES(p,'2026-10-05','2026-10-31','{"cadence":"monthly"}') RETURNING id INTO cy;
 -- The open cycle can be rescheduled; a submitted review cannot be rewritten.
 UPDATE phs.review_cycle SET due_on='2026-11-30' WHERE id=cy;
 INSERT INTO phs.review_draft(cycle_id,author_id,payload) VALUES(cy,u,'{"topics":["milestones"]}');
 DELETE FROM phs.review_draft WHERE cycle_id=cy;
 INSERT INTO phs.health_review(project_id,cycle_id,revision_no,author_id,effective_on,nothing_changed,topics,submitted_data,expectations_snapshot)
 VALUES(p,cy,1,u,'2026-10-05',true,'{}','{}','[]') RETURNING id INTO rv;
 PERFORM pg_temp.expect_error(format('UPDATE phs.health_review SET support_text=%L WHERE id=%L','otro',rv),'42501');
 INSERT INTO phs.review_validation(review_id,decision,validator_id,comment) VALUES(rv,'returned',u,'Falta detalle');
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.review_validation(review_id,decision,validator_id,comment) VALUES(%L,%L,%L,%L)',rv,'validated',u,'Otra'),'23505');
 RESET ROLE;
 SET LOCAL ROLE phs_projects;
 PERFORM pg_temp.expect_error(format('UPDATE phs.review_policy SET cadence=%L WHERE project_id=%L','weekly',p),'42501');
 RESET ROLE;
 RAISE NOTICE 'PASS: review policy with anchor and revision, reschedulable open cycle; 5 expected rejections';
END $$;
ROLLBACK;
