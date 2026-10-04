-- Run as the migration owner after migrations 001-007; all fixtures roll back.
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
DECLARE u uuid; h text := encode(sha256('payload'::bytea),'hex');
BEGIN
 INSERT INTO app_user(display_name,email) VALUES('Idem','idem@example.invalid') RETURNING id INTO u;
 SET LOCAL ROLE phs_projects;
 INSERT INTO phs.command_idempotency(service,user_id,key,command,request_hash,response_status,response_body)
 VALUES('projects',u,'key-00000001','project.create',h,201,'{"id":"x"}');
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.command_idempotency(service,user_id,key,command,request_hash,response_status,response_body) VALUES(%L,%L,%L,%L,%L,201,%L)','projects',u,'key-00000001','project.create',h,'{}'),'23505');
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.command_idempotency(service,user_id,key,command,request_hash,response_status,response_body) VALUES(%L,%L,%L,%L,%L,500,%L)','projects',u,'key-00000002','project.create',h,'{}'),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.command_idempotency(service,user_id,key,command,request_hash,response_status,response_body) VALUES(%L,%L,%L,%L,%L,201,%L)','projects',u,'short','project.create',h,'{}'),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.command_idempotency(service,user_id,key,command,request_hash,response_status,response_body) VALUES(%L,%L,%L,%L,%L,201,%L)','projects',u,'key-00000003','project.create','not-a-hash','{}'),'23514');
 PERFORM pg_temp.expect_error('UPDATE phs.command_idempotency SET response_status=200','42501');
 PERFORM pg_temp.expect_error('DELETE FROM phs.command_idempotency','42501');
 -- The same key belongs to each service separately.
 RESET ROLE;
 SET LOCAL ROLE phs_health;
 INSERT INTO phs.command_idempotency(service,user_id,key,command,request_hash,response_status,response_body)
 VALUES('health',u,'key-00000001','review.submit',h,201,'{}');
 RESET ROLE;
 RAISE NOTICE 'PASS: idempotency records are insert-only per service; 6 expected rejections';
END $$;
ROLLBACK;
