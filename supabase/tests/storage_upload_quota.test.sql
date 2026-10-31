-- Run against a disposable database after migration 20261101120000; rolls back fixtures.
-- Bounds direct Storage API uploads per user/plan (audit §4.6).
BEGIN;
CREATE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
 PERFORM set_config('request.jwt.claim.sub', u::text, true);
 PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END $$;
CREATE FUNCTION pg_temp.denied(sql text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE sql;
 RETURN false;
EXCEPTION WHEN insufficient_privilege THEN RETURN true;
END $$;

DO $$
DECLARE
 free_u uuid:=gen_random_uuid();
 pro_u uuid:=gen_random_uuid();
 rec_u uuid:=gen_random_uuid();
 i int;
 camp text:=gen_random_uuid()::text;
BEGIN
 INSERT INTO auth.users(id) VALUES(free_u),(pro_u),(rec_u);
 INSERT INTO public.profiles(id,email,plan,has_permission) VALUES
  (free_u,'free-quota@example.test','free',true),
  (pro_u,'pro-quota@example.test','pro',true),
  (rec_u,'rec-quota@example.test','recruiter',true);
 GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated; -- stub env; Supabase grants this by default
 GRANT SELECT,INSERT ON storage.objects TO service_role;

 SET LOCAL ROLE authenticated;

 -- Free: 1 saved CV object, 6 temp objects.
 PERFORM pg_temp.as_user(free_u);
 INSERT INTO storage.objects(bucket_id,name) VALUES('cv-files', free_u||'/save-1/file.pdf');
 ASSERT pg_temp.denied(format('INSERT INTO storage.objects(bucket_id,name) VALUES(%L,%L)','cv-files',free_u||'/save-2/file.pdf')),
  'free got a 2nd saved CV object';
 FOR i IN 1..6 LOOP
  INSERT INTO storage.objects(bucket_id,name) VALUES('cv-analyze-tmp', free_u||'/tmp-'||i||'.pdf');
 END LOOP;
 ASSERT pg_temp.denied(format('INSERT INTO storage.objects(bucket_id,name) VALUES(%L,%L)','cv-analyze-tmp',free_u||'/tmp-7.pdf')),
  'free got a 7th temp object';

 -- Pro: 10 saved CV objects.
 PERFORM pg_temp.as_user(pro_u);
 FOR i IN 1..10 LOOP
  INSERT INTO storage.objects(bucket_id,name) VALUES('cv-files', pro_u||'/save-'||i||'/file.pdf');
 END LOOP;
 ASSERT pg_temp.denied(format('INSERT INTO storage.objects(bucket_id,name) VALUES(%L,%L)','cv-files',pro_u||'/save-11/file.pdf')),
  'pro got an 11th saved CV object';

 -- Recruiter: 50 saved, 60 temp, 50 candidates per campaign.
 PERFORM pg_temp.as_user(rec_u);
 FOR i IN 1..50 LOOP
  INSERT INTO storage.objects(bucket_id,name) VALUES('cv-files', rec_u||'/save-'||i||'/file.pdf');
 END LOOP;
 ASSERT pg_temp.denied(format('INSERT INTO storage.objects(bucket_id,name) VALUES(%L,%L)','cv-files',rec_u||'/save-51/file.pdf')),
  'recruiter got a 51st saved CV object';

 FOR i IN 1..60 LOOP
  INSERT INTO storage.objects(bucket_id,name) VALUES('cv-analyze-tmp', rec_u||'/tmp-'||i||'.pdf');
 END LOOP;
 ASSERT pg_temp.denied(format('INSERT INTO storage.objects(bucket_id,name) VALUES(%L,%L)','cv-analyze-tmp',rec_u||'/tmp-61.pdf')),
  'recruiter got a 61st temp object';

 FOR i IN 1..50 LOOP
  INSERT INTO storage.objects(bucket_id,name) VALUES('cv-files', rec_u||'/campaigns/'||camp||'/'||i||'.pdf');
 END LOOP;
 ASSERT pg_temp.denied(format('INSERT INTO storage.objects(bucket_id,name) VALUES(%L,%L)','cv-files',rec_u||'/campaigns/'||camp||'/51.pdf')),
  'campaign got a 51st candidate object';

 -- Paths outside the two known shapes cannot open an uncounted folder.
 ASSERT pg_temp.denied(format('INSERT INTO storage.objects(bucket_id,name) VALUES(%L,%L)','cv-files',pro_u||'/misc/deep/file.pdf')),
  'unexpected cv-files path accepted';
 -- Non-recruiters cannot create candidate folders directly.
 ASSERT pg_temp.denied(format('INSERT INTO storage.objects(bucket_id,name) VALUES(%L,%L)','cv-files',free_u||'/campaigns/'||camp||'/x.pdf')),
  'free plan created a candidate object';

 -- service_role maintenance bypasses the cap.
 RESET ROLE;
 SET LOCAL ROLE service_role;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 INSERT INTO storage.objects(bucket_id,name) VALUES('cv-files', rec_u||'/save-51/file.pdf');
 INSERT INTO storage.objects(bucket_id,name,created_at) VALUES('cv-analyze-tmp', free_u||'/stale.pdf', now()-interval '2 days');
END $$;

-- Cleanup listing: only objects older than 24h are returned, service_role only.
DO $$
DECLARE rows int;
BEGIN
 ASSERT NOT has_function_privilege('anon','public.list_expired_temp_objects(integer)','EXECUTE'), 'anon can list temp objects';
 ASSERT NOT has_function_privilege('authenticated','public.list_expired_temp_objects(integer)','EXECUTE'), 'authenticated can list temp objects';
 ASSERT has_function_privilege('service_role','public.list_expired_temp_objects(integer)','EXECUTE'), 'service_role cannot list temp objects';
 ASSERT NOT has_function_privilege('authenticated','public.enforce_storage_quota()','EXECUTE'), 'authenticated can call the quota trigger fn';

 SELECT count(*) INTO rows FROM public.list_expired_temp_objects(100) AS x WHERE x.name LIKE '%/stale.pdf';
 ASSERT rows=1, format('stale temp object not listed: %s', rows);
 SELECT count(*) INTO rows FROM public.list_expired_temp_objects(100) AS x WHERE x.name NOT LIKE '%/stale.pdf';
 ASSERT rows=0, format('recent temp objects leaked into cleanup list: %s', rows);
END $$;

ROLLBACK;
