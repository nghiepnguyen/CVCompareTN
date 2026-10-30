-- Run against a disposable database after migration 20261101080000; rolls back fixtures.
BEGIN;
DO $$
DECLARE f uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); x uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); n integer;
BEGIN
 INSERT INTO auth.users(id) VALUES(f),(p),(x),(a);
 INSERT INTO public.profiles(id,email,plan,plan_expires_at,role) VALUES
  (f,'f@example.test','free',NULL,'user'),
  (p,'p@example.test','pro',now()+interval '1 day','user'),
  (x,'x@example.test','pro',now()-interval '1 day','user'),
  (a,'a@example.test','free',NULL,'admin');
 INSERT INTO public.history(user_id,analysis_id,timestamp) VALUES
  (f,'free-old',now()-interval '8 days'),(f,'free-new',now()-interval '6 days'),
  (p,'pro-old',now()-interval '90 days'),
  (x,'expired-old',now()-interval '30 days'),
  (a,'admin-old',now()-interval '90 days');

 ASSERT NOT has_function_privilege('authenticated','public.purge_expired_free_history()','EXECUTE'), 'authenticated can purge';
 ASSERT NOT has_function_privilege('anon','public.purge_expired_free_history()','EXECUTE'), 'anon can purge';

 n := public.purge_expired_free_history();
 ASSERT n = 2, 'expected 2 deleted, got '||n;
 ASSERT NOT EXISTS (SELECT 1 FROM public.history WHERE analysis_id IN ('free-old','expired-old')), 'old free rows kept';
 SELECT count(*) INTO n FROM public.history WHERE analysis_id IN ('free-new','pro-old','admin-old');
 ASSERT n = 3, 'deleted a row that must stay';
END $$;
ROLLBACK;
