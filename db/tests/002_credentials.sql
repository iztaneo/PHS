-- Run with psql -X -v ON_ERROR_STOP=1 -f ... after migrations 001 and 002; all fixtures roll back.
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
 u uuid; u2 uuid; issuer text;
 -- Syntactically valid PHC string for tests; not a real password hash.
 h text := '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Zm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyZm8';
BEGIN
 INSERT INTO app_user(display_name,email) VALUES('Local','Local.User@example.invalid')
 RETURNING id,identity_issuer INTO u,issuer;
 IF issuer <> 'local' THEN RAISE EXCEPTION 'Local user must default to issuer local'; END IF;
 INSERT INTO app_user(display_name,email) VALUES('Other','other@example.invalid') RETURNING id INTO u2;
 INSERT INTO user_credential(user_id,password_hash,created_by) VALUES(u,h,u2);
 IF NOT (SELECT must_change_password FROM user_credential WHERE user_id=u) THEN
  RAISE EXCEPTION 'New credential must require a password change';
 END IF;
 PERFORM pg_temp.expect_error(format('INSERT INTO app_user(display_name,email) VALUES(%L,%L)','Dup','local.user@EXAMPLE.invalid'),'23505');
 PERFORM pg_temp.expect_error(format('INSERT INTO app_user(display_name,email) VALUES(%L,%L)','Empty',''),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO app_user(display_name,email) VALUES(%L,%L)','Padded',' padded@example.invalid'),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO user_credential(user_id,password_hash) VALUES(%L,%L)',u2,'plaintext-password'),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO user_credential(user_id,password_hash) VALUES(%L,%L)',u2,'$2b$12$abcdefghijklmnopqrstuuJ8mQw1cQwYb0a8m9cY8g1f8m9cY8g1f'),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO user_credential(user_id,password_hash) VALUES(%L,%L)',u,h),'23505');
 PERFORM pg_temp.expect_error(format('INSERT INTO user_credential(user_id,password_hash) VALUES(%L,%L)',gen_random_uuid(),h),'23503');
 PERFORM pg_temp.expect_error(format('UPDATE user_credential SET failed_attempts=-1 WHERE user_id=%L',u),'23514');
 UPDATE user_credential SET failed_attempts=5,locked_until=now()+interval '15 minutes' WHERE user_id=u;
 UPDATE user_credential SET failed_attempts=0,locked_until=NULL,last_login_at=now(),must_change_password=false WHERE user_id=u;
 RAISE NOTICE 'PASS: local credential workflow and 8 expected constraint failures';
END $$;
ROLLBACK;
