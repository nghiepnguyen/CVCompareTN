-- READ-ONLY post-apply verification for 20261116000000_analytics_quota_reservations.
-- Safe on production: SELECT only, no writes, no role switching.
--   supabase db query --linked -f supabase/tests/analytics_quota_reservations.prod_verify.sql
-- Every row must report ok = true. Any false is a rollback trigger (see
-- docs/audits/2026-11-16-m2c2a-migration-preflight.md).
WITH fn AS (
  SELECT p.oid, p.oid::regprocedure::text AS sig, p.prosecdef, p.proconfig, md5(pg_get_functiondef(p.oid)) AS md5
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.proname LIKE 'analytics_quota%' OR p.proname IN ('reserve_analytics_quota','commit_analytics_quota','release_analytics_quota'))
), expected(sig, md5, definer, service_exec) AS (VALUES
  ('analytics_quota_expire(uuid,integer,text)',                       '5e55d21ae58a0c118126967cf18b76fa', false, false),
  ('analytics_quota_forgiven_per_cycle()',                            '10badb2bb6347f18c205a281e0876383', false, false),
  ('analytics_quota_lock_state(uuid)',                                '8ef9ce0a360b04edc81aa32285d78680', false, false),
  ('analytics_quota_mark_uncertain(uuid,text,integer,integer,text)',  '702e6d373ca0d69912a62f96466534c4', false, false),
  ('commit_analytics_quota(uuid,uuid)',                               'a057561efc157c4e1119528745cd3948', true,  true),
  ('release_analytics_quota(uuid,uuid,text)',                         '80ea6d90d18bf806b5656ac6f60dba02', true,  true),
  ('reserve_analytics_quota(uuid,uuid,integer)',                      '9b4b1cbd116f98ed5258ee0a500622dc', true,  true)
)
SELECT 'migration recorded' AS check, EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261116000000') AS ok
UNION ALL SELECT 'table exists, RLS on, no policies',
  to_regclass('public.analytics_quota_reservations') IS NOT NULL
  AND (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.analytics_quota_reservations'))
  AND NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = to_regclass('public.analytics_quota_reservations'))
UNION ALL SELECT 'table: no anon/authenticated privileges (effective)',
  NOT has_table_privilege('anon', 'public.analytics_quota_reservations', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  AND NOT has_table_privilege('authenticated', 'public.analytics_quota_reservations', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
UNION ALL SELECT 'table columns match (md5)',
  (SELECT md5(string_agg(column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,''), ',' ORDER BY ordinal_position))
     FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analytics_quota_reservations') = 'cb92782783445a97dd202e49236f68d6'
UNION ALL SELECT 'table constraints match (md5)',
  (SELECT md5(string_agg(conname||':'||pg_get_constraintdef(oid), ',' ORDER BY conname))
     FROM pg_constraint WHERE conrelid = to_regclass('public.analytics_quota_reservations')) = 'de5a9768dccacbbdfbbb39e545892909'
UNION ALL SELECT 'exactly 7 ledger functions', (SELECT count(*) FROM fn) = 7
UNION ALL SELECT 'fn '||e.sig||' matches (md5, definer, search_path, grants)',
  f.md5 = e.md5 AND f.prosecdef = e.definer AND f.proconfig @> ARRAY['search_path=""']
  AND NOT has_function_privilege('anon', f.oid, 'EXECUTE')
  AND NOT has_function_privilege('authenticated', f.oid, 'EXECUTE')
  AND has_function_privilege('service_role', f.oid, 'EXECUTE') = e.service_exec
  FROM expected e LEFT JOIN fn f ON f.sig = e.sig
UNION ALL SELECT 'legacy check_analytics_quota unchanged', md5(pg_get_functiondef('public.check_analytics_quota(uuid,integer)'::regprocedure)) = 'e7a52b5a7b00e351e183fbdd95e20631'
UNION ALL SELECT 'legacy increment_usage_count unchanged', md5(pg_get_functiondef('public.increment_usage_count(uuid)'::regprocedure)) = '74524365498b83617e28bca23959aed5'
UNION ALL SELECT 'ledger empty before app deploy', (SELECT count(*) FROM public.analytics_quota_reservations) = 0;
