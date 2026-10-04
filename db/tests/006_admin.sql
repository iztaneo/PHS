-- Run as the migration owner after migrations 001-006; all fixtures roll back.
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
DECLARE u uuid; pr uuid;
BEGIN
 INSERT INTO app_user(display_name,email) VALUES('Admin test','admin-test@example.invalid') RETURNING id INTO u;
 IF (SELECT is_admin FROM app_user WHERE id=u) THEN RAISE EXCEPTION 'New users must not be administrators'; END IF;
 INSERT INTO practice(code,name) VALUES('ADM','Admin test') RETURNING id INTO pr;
 INSERT INTO practice_membership(practice_id,user_id,role) VALUES(pr,u,'pm'),(pr,u,'lead'),(pr,u,'director');
 PERFORM pg_temp.expect_error(format('INSERT INTO practice_membership(practice_id,user_id,role) VALUES(%L,%L,%L)',pr,u,'admin'),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO practice_membership(practice_id,user_id,role) VALUES(%L,%L,%L)',pr,u,'pm'),'23505');
 SET LOCAL ROLE phs_projects;
 PERFORM pg_temp.expect_error(format('UPDATE phs.app_user SET is_admin=true WHERE id=%L',u),'42501');
 RESET ROLE;
 SET LOCAL ROLE phs_identity;
 UPDATE phs.app_user SET is_admin=true WHERE id=u;
 RESET ROLE;
 RAISE NOTICE 'PASS: accumulated practice roles, global admin flag and 3 expected rejections';
END $$;
ROLLBACK;
