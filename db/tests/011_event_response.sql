-- Run as the migration owner after migrations 001-011; all fixtures roll back.
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
DECLARE u uuid; pr uuid; c uuid; p uuid; p2 uuid; ev uuid; ch uuid; r uuid;
BEGIN
 INSERT INTO app_user(display_name,email) VALUES('Er','er@example.invalid') RETURNING id INTO u;
 INSERT INTO practice(code,name) VALUES('ER','Er') RETURNING id INTO pr;
 INSERT INTO client(name) VALUES('Cliente') RETURNING id INTO c;
 INSERT INTO project(practice_id,client_id,code,name,service_type_code,pm_id,lead_id,technical_owner_id,starts_on,ends_on)
 VALUES(pr,c,'ER-1','Er','development',u,u,u,'2026-01-01','2026-12-31') RETURNING id INTO p;
 INSERT INTO project(practice_id,client_id,code,name,service_type_code,pm_id,lead_id,technical_owner_id,starts_on,ends_on)
 VALUES(pr,c,'ER-2','Er 2','development',u,u,u,'2026-01-01','2026-12-31') RETURNING id INTO p2;
 INSERT INTO project_change(project_id,title,description,change_type,proposed_by,requested_impact) VALUES(p,'Cambio','Motivo','internal',u,'{}') RETURNING id INTO ch;
 SET LOCAL ROLE phs_health;
 INSERT INTO phs.health_event(project_id,rule_key,condition_key,episode,severity,title) VALUES(p,'milestone_overdue','milestone_overdue:x',1,'critical','Hito vencido') RETURNING id INTO ev;
 INSERT INTO phs.event_response(project_id,event_id,revision_no,cause,kind,plan,submitted_by)
 VALUES(p,ev,1,'El proveedor no entregó','remediation','Construir un simulador',u) RETURNING id INTO r;
 INSERT INTO phs.event_response(project_id,event_id,revision_no,cause,kind,plan,change_id,submitted_by)
 VALUES(p,ev,2,'El proveedor no entregó','replan','Mover la fecha tres semanas',ch,u);
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.event_response(project_id,event_id,revision_no,cause,kind,plan,submitted_by) VALUES(%L,%L,1,%L,%L,%L,%L)',p,ev,'x','remediation','y',u),'23505');
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.event_response(project_id,event_id,revision_no,cause,kind,plan,submitted_by) VALUES(%L,%L,3,%L,%L,%L,%L)',p,ev,' ','remediation','y',u),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.event_response(project_id,event_id,revision_no,cause,kind,plan,submitted_by) VALUES(%L,%L,3,%L,%L,%L,%L)',p,ev,'x','replan','sin cambio',u),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.event_response(project_id,event_id,revision_no,cause,kind,plan,change_id,submitted_by) VALUES(%L,%L,3,%L,%L,%L,%L,%L)',p,ev,'x','remediation','con cambio',ch,u),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.event_response(project_id,event_id,revision_no,cause,kind,plan,submitted_by) VALUES(%L,%L,3,%L,%L,%L,%L)',p2,ev,'x','remediation','otro proyecto',u),'23503');
 INSERT INTO phs.event_response_validation(response_id,decision,validator_id,comment) VALUES(r,'returned',u,'Falta el plan detallado');
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.event_response_validation(response_id,decision,validator_id,comment) VALUES(%L,%L,%L,%L)',r,'validated',u,'Segunda decisión'),'23505');
 PERFORM pg_temp.expect_error(format('UPDATE phs.event_response SET plan=%L WHERE id=%L','otro',r),'42501');
 RESET ROLE;
 SET LOCAL ROLE phs_projects;
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.event_response_validation(response_id,decision,validator_id,comment) VALUES(%L,%L,%L,%L)',gen_random_uuid(),'validated',u,'x'),'42501');
 RESET ROLE;
 PERFORM pg_temp.expect_error(format('DELETE FROM event_response WHERE id=%L',r),'55000');
 RAISE NOTICE 'PASS: event responses with revisions and one validation each; 9 expected rejections';
END $$;
ROLLBACK;
