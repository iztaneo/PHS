-- LOCAL DEVELOPMENT ONLY. Login users for the services; never run against a shared environment.
-- Usage: psql -v dev_password=... -f db/local/dev_logins.sql
-- Safe to repeat; hide the "already granted" notices on later runs.
SET client_min_messages = warning;
SELECT format('CREATE ROLE %I LOGIN', r) FROM unnest(ARRAY['phs_identity_dev','phs_projects_dev','phs_health_dev','phs_platform_dev']) AS r
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) \gexec
ALTER ROLE phs_identity_dev PASSWORD :'dev_password';
ALTER ROLE phs_projects_dev PASSWORD :'dev_password';
ALTER ROLE phs_health_dev PASSWORD :'dev_password';
ALTER ROLE phs_platform_dev PASSWORD :'dev_password';
GRANT phs_identity TO phs_identity_dev;
GRANT phs_projects TO phs_projects_dev;
GRANT phs_health TO phs_health_dev;
GRANT phs_platform TO phs_platform_dev;
