-- M2-Q H1.0 / H1 post-apply: READ-ONLY production check of ledger privileges.
-- SELECT only. Run by the owner (SQL Editor or `supabase db query --linked`).
-- Expected AFTER H1: service_role del/trunc/trig/refs = false; sel/ins/upd = true;
-- anon/authenticated/authenticator all false; 0 policies; owner postgres.
-- Before H1 the same query shows service_role del/trunc/trig/refs = true.
-- Superuser rows (rolsuper = true, e.g. supabase_admin) and the owner (postgres)
-- are EXPECTED to show true everywhere. GO rule: no NON-superuser role other
-- than postgres and service_role holds DELETE or TRUNCATE.
SELECT 'privileges' AS check, r.rolname AS role, r.rolsuper AS superuser, r.rolbypassrls AS bypassrls,
       has_table_privilege(r.rolname, 'public.analytics_quota_reservations', 'SELECT')     AS sel,
       has_table_privilege(r.rolname, 'public.analytics_quota_reservations', 'INSERT')     AS ins,
       has_table_privilege(r.rolname, 'public.analytics_quota_reservations', 'UPDATE')     AS upd,
       has_table_privilege(r.rolname, 'public.analytics_quota_reservations', 'DELETE')     AS del,
       has_table_privilege(r.rolname, 'public.analytics_quota_reservations', 'TRUNCATE')   AS trunc,
       has_table_privilege(r.rolname, 'public.analytics_quota_reservations', 'TRIGGER')    AS trig,
       has_table_privilege(r.rolname, 'public.analytics_quota_reservations', 'REFERENCES') AS refs
  FROM pg_roles r
 WHERE r.rolname IN ('anon','authenticated','authenticator','service_role','postgres',
                     'supabase_admin','supabase_auth_admin','supabase_storage_admin','dashboard_user','pgbouncer')
 ORDER BY r.rolname;

SELECT 'acl' AS check, c.relacl::text AS relacl, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename='analytics_quota_reservations') AS policies,
       current_setting('server_version') AS pg_version
  FROM pg_class c WHERE c.oid = 'public.analytics_quota_reservations'::regclass;

-- Role inheritance (columns valid on PG 15-17; no inherit_option/set_option).
SELECT 'membership' AS check, pg_get_userbyid(m.roleid) AS granted_role, pg_get_userbyid(m.member) AS member
  FROM pg_auth_members m
 WHERE pg_get_userbyid(m.roleid) IN ('service_role','authenticated','anon','postgres')
    OR pg_get_userbyid(m.member) IN ('service_role','authenticated','anon')
 ORDER BY 2, 3;

-- FK cascade path (expect profiles, delete action 'c').
SELECT 'fk' AS check, conname, confrelid::regclass::text AS references_table, confdeltype AS on_delete
  FROM pg_constraint WHERE conrelid = 'public.analytics_quota_reservations'::regclass AND contype = 'f';

-- Ledger fingerprint (aggregates only, no PII) for before/after comparison.
SELECT 'fingerprint' AS check, count(*) AS n,
       md5(coalesce(string_agg(id::text || state || charged::text, ',' ORDER BY id), '')) AS fp
  FROM public.analytics_quota_reservations;
