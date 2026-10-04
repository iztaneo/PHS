-- Run as the migration owner after migrations 001-008; all fixtures roll back.
BEGIN;
SET search_path = phs, public;
DO $$
DECLARE u uuid; pr uuid; c uuid; p uuid; m uuid;
BEGIN
 INSERT INTO app_user(display_name,email) VALUES('Ctx','ctx@example.invalid') RETURNING id INTO u;
 INSERT INTO practice(code,name) VALUES('CTX','Ctx') RETURNING id INTO pr;
 INSERT INTO client(name,primary_contact) VALUES('Cliente','Contacto general') RETURNING id INTO c;
 INSERT INTO project(practice_id,client_id,code,name,service_type_code,pm_id,lead_id,technical_owner_id,starts_on,ends_on)
 VALUES(pr,c,'CTX-1','Ctx','development',u,u,u,'2026-01-01','2026-12-31') RETURNING id INTO p;
 IF (SELECT client_contact || escalation_notes FROM project WHERE id=p) <> '' THEN
  RAISE EXCEPTION 'Project context must default to empty';
 END IF;
 INSERT INTO milestone(project_id,title,owner_id,due_on) VALUES(p,'Hito',u,'2026-03-01') RETURNING id INTO m;
 IF (SELECT committed_due_on FROM milestone WHERE id=m) IS NOT NULL THEN
  RAISE EXCEPTION 'A new milestone has no committed date';
 END IF;
 SET LOCAL ROLE phs_projects;
 UPDATE phs.project SET client_contact='Ana, ana@cliente.test', escalation_notes='Escalar a dirección' WHERE id=p;
 UPDATE phs.milestone SET committed_due_on=due_on WHERE id=m;
 UPDATE phs.milestone SET due_on='2026-04-01', status='rescheduled' WHERE id=m;
 RESET ROLE;
 IF (SELECT committed_due_on::text || '>' || due_on::text FROM milestone WHERE id=m) <> '2026-03-01>2026-04-01' THEN
  RAISE EXCEPTION 'Rescheduling must keep the committed date';
 END IF;
 IF (SELECT primary_contact FROM client WHERE id=c) <> 'Contacto general' THEN
  RAISE EXCEPTION 'Project context must not overwrite the client data';
 END IF;
 RAISE NOTICE 'PASS: project context separate from client data; committed date survives a reschedule';
END $$;
ROLLBACK;
