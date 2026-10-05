-- Run as the migration owner after migrations 001-013; all fixtures roll back.
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
DECLARE u uuid;
BEGIN
 INSERT INTO app_user(display_name,email) VALUES('Hd','hd@example.invalid') RETURNING id INTO u;
 SET LOCAL ROLE phs_health;
 INSERT INTO phs.holiday(day,name,created_by) VALUES('2031-11-17','Revolución',u);
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.holiday(day,name,created_by) VALUES(%L,%L,%L)','2031-11-17','Otra vez',u),'23505');
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.holiday(day,name,created_by) VALUES(%L,%L,%L)','2031-12-25',' ',u),'23514');
 PERFORM pg_temp.expect_error(format('UPDATE phs.holiday SET name=%L WHERE day=%L','Cambio','2031-11-17'),'42501');
 DELETE FROM phs.holiday WHERE day='2031-11-17';
 RESET ROLE;
 SET LOCAL ROLE phs_projects;
 PERFORM pg_temp.expect_error(format('INSERT INTO phs.holiday(day,name,created_by) VALUES(%L,%L,%L)','2031-12-25','Navidad',u),'42501');
 RESET ROLE;
 RAISE NOTICE 'PASS: holiday calendar maintained by Health; 4 expected rejections';
END $$;
ROLLBACK;
