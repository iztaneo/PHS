-- Run as the migration owner after migrations 001-015; all fixtures roll back.
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
 INSERT INTO phs.scheduler_run(started_at, finished_at) VALUES('1999-01-01 10:00+00','1999-01-01 10:01+00') RETURNING id INTO r;
 INSERT INTO phs.scheduler_run_daily(day,runs,completed,interrupted,runs_with_failures,projects_processed) VALUES('1999-01-01',3,2,1,1,10);
 DELETE FROM phs.scheduler_run WHERE id = r;
 PERFORM pg_temp.expect_error('INSERT INTO phs.scheduler_run_daily(day,runs,completed,interrupted,runs_with_failures,projects_processed) VALUES(''1999-01-01'',1,1,0,0,1)','23505');
 PERFORM pg_temp.expect_error('INSERT INTO phs.scheduler_run_daily(day,runs,completed,interrupted,runs_with_failures,projects_processed) VALUES(''1999-01-02'',3,1,1,0,1)','23514');
 PERFORM pg_temp.expect_error('INSERT INTO phs.scheduler_run_daily(day,runs,completed,interrupted,runs_with_failures,projects_processed) VALUES(''1999-01-03'',1,1,0,2,1)','23514');
 PERFORM pg_temp.expect_error('DELETE FROM phs.scheduler_run_daily WHERE day = ''1999-01-01''','42501');
 RESET ROLE;
 SET LOCAL ROLE phs_platform;
 PERFORM pg_temp.expect_error('DELETE FROM phs.scheduler_run','42501');
 RESET ROLE;
 RAISE NOTICE 'PASS: daily history of scheduler runs; 5 expected rejections';
END $$;
ROLLBACK;
