-- Run as the migration owner after migrations 001-014; all fixtures roll back.
-- Since migration 015 Health may delete runs it has archived, so that is checked in test 015.
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
DECLARE r uuid;
BEGIN
 SET LOCAL ROLE phs_health;
 INSERT INTO phs.scheduler_run DEFAULT VALUES RETURNING id INTO r;
 UPDATE phs.scheduler_run SET finished_at = now(), projects_processed = 3, failures = '[{"projectId":"x","error":"y"}]' WHERE id = r;
 PERFORM pg_temp.expect_error(format('UPDATE phs.scheduler_run SET failures = %L WHERE id = %L','{}',r),'23514');
 PERFORM pg_temp.expect_error(format('UPDATE phs.scheduler_run SET finished_at = started_at - interval %L WHERE id = %L','1 second',r),'23514');
 RESET ROLE;
 SET LOCAL ROLE phs_platform;
 PERFORM pg_temp.expect_error('INSERT INTO phs.scheduler_run DEFAULT VALUES','42501');
 RESET ROLE;
 RAISE NOTICE 'PASS: scheduler runs recorded by Health; 3 expected rejections';
END $$;
ROLLBACK;
