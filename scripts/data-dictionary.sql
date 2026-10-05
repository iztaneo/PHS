-- Reads the structure of schema phs from the catalog as one JSON document, for scripts/data-dictionary.mjs.
SELECT jsonb_build_object(
 'migrations', (SELECT count(*) FROM schema_migrations),
 -- Current rows of the catalogue tables: small reference data that people choose from.
 'catalogs', jsonb_build_object(
   'serviceTypes', (SELECT coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'active', active) ORDER BY code), '[]') FROM phs.service_type),
   'practices', (SELECT coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'timezone', timezone) ORDER BY code), '[]') FROM phs.practice),
   'holidays', (SELECT coalesce(jsonb_agg(jsonb_build_object('day', day::text, 'name', name) ORDER BY day), '[]') FROM phs.holiday),
   'ruleSets', (SELECT coalesce(jsonb_agg(jsonb_build_object('version', version, 'engineVersion', engine_version) ORDER BY version), '[]') FROM phs.rule_set)),
 'tables', (SELECT jsonb_agg(t ORDER BY t->>'name') FROM (
   SELECT jsonb_build_object(
     'name', c.relname,
     'columns', (SELECT jsonb_agg(jsonb_build_object(
          'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'notNull', a.attnotnull,
          'default', pg_get_expr(d.adbin, d.adrelid)) ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped),
     'constraints', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'name', k.conname, 'type', k.contype, 'definition', pg_get_constraintdef(k.oid),
          'columns', (SELECT jsonb_agg(a.attname ORDER BY x.n) FROM unnest(k.conkey) WITH ORDINALITY x(attnum, n)
                       JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = x.attnum),
          'refTable', (SELECT r.relname FROM pg_class r WHERE r.oid = k.confrelid),
          'refColumns', (SELECT jsonb_agg(a.attname ORDER BY x.n) FROM unnest(k.confkey) WITH ORDINALITY x(attnum, n)
                          JOIN pg_attribute a ON a.attrelid = k.confrelid AND a.attnum = x.attnum))
          ORDER BY k.contype, k.conname), '[]')
        FROM pg_constraint k WHERE k.conrelid = c.oid),
     'indexes', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', i.relname, 'definition', pg_get_indexdef(i.oid), 'unique', x.indisunique) ORDER BY i.relname), '[]')
        FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
       WHERE x.indrelid = c.oid AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = x.indexrelid)),
     'triggers', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', g.tgname, 'function', p.proname,
          'definition', pg_get_triggerdef(g.oid)) ORDER BY g.tgname), '[]')
        FROM pg_trigger g JOIN pg_proc p ON p.oid = g.tgfoid WHERE g.tgrelid = c.oid AND NOT g.tgisinternal),
     'grants', (SELECT coalesce(jsonb_object_agg(role, privileges), '{}') FROM (
          SELECT grantee AS role, jsonb_agg(privilege_type ORDER BY privilege_type) AS privileges
            FROM information_schema.role_table_grants
           WHERE table_schema = 'phs' AND table_name = c.relname AND grantee LIKE 'phs\_%' AND privilege_type <> 'SELECT'
           GROUP BY grantee) g)
   ) AS t
   FROM pg_class c WHERE c.relnamespace = 'phs'::regnamespace AND c.relkind = 'r' AND c.relname <> 'schema_migrations') s)
)::text;
