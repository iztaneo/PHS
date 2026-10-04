-- Run with psql -X -v ON_ERROR_STOP=1 -f ... after migrations 001-003; all fixtures roll back.
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
 u uuid; s uuid; s2 uuid; active integer;
 h text := encode(sha256('test-token-1'::bytea),'hex');
 h2 text := encode(sha256('test-token-2'::bytea),'hex');
BEGIN
 INSERT INTO app_user(display_name,email) VALUES('Session','session@example.invalid') RETURNING id INTO u;
 INSERT INTO user_session(user_id,token_hash,expires_at,ip_address,user_agent)
 VALUES(u,h,now()+interval '12 hours','127.0.0.1','test') RETURNING id INTO s;
 INSERT INTO user_session(user_id,token_hash,expires_at) VALUES(u,h2,now()+interval '12 hours') RETURNING id INTO s2;
 PERFORM pg_temp.expect_error(format('INSERT INTO user_session(user_id,token_hash,expires_at) VALUES(%L,%L,now()+interval ''1 hour'')',u,'raw-token-value'),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO user_session(user_id,token_hash,expires_at) VALUES(%L,%L,now()+interval ''1 hour'')',u,h),'23505');
 PERFORM pg_temp.expect_error(format('INSERT INTO user_session(user_id,token_hash,expires_at) VALUES(%L,%L,now()-interval ''1 hour'')',u,encode(sha256('t3'::bytea),'hex')),'23514');
 PERFORM pg_temp.expect_error(format('INSERT INTO user_session(user_id,token_hash,expires_at) VALUES(%L,%L,now()+interval ''1 hour'')',gen_random_uuid(),encode(sha256('t4'::bytea),'hex')),'23503');
 PERFORM pg_temp.expect_error(format('UPDATE user_session SET revoked_at=now() WHERE id=%L',s),'23514');
 PERFORM pg_temp.expect_error(format('UPDATE user_session SET revoked_at=now(),revoke_reason=%L WHERE id=%L','because',s),'23514');
 PERFORM pg_temp.expect_error(format('UPDATE user_session SET revoked_at=created_at-interval ''1 second'',revoke_reason=%L WHERE id=%L','logout',s),'23514');
 UPDATE user_session SET last_seen_at=clock_timestamp() WHERE id=s;
 UPDATE user_session SET revoked_at=clock_timestamp(),revoke_reason='logout' WHERE id=s;
 SELECT count(*) INTO active FROM user_session WHERE user_id=u AND revoked_at IS NULL AND expires_at > now();
 IF active <> 1 THEN RAISE EXCEPTION 'Expected one active session, got %',active; END IF;
 -- Disabling a user revokes every remaining session in one statement.
 UPDATE user_session SET revoked_at=clock_timestamp(),revoke_reason='user_disabled' WHERE user_id=u AND revoked_at IS NULL;
 IF EXISTS(SELECT 1 FROM user_session WHERE user_id=u AND revoked_at IS NULL) THEN
  RAISE EXCEPTION 'All sessions must be revoked';
 END IF;
 DELETE FROM user_session WHERE id=s2;
 RAISE NOTICE 'PASS: session workflow and 7 expected constraint failures';
END $$;
ROLLBACK;
