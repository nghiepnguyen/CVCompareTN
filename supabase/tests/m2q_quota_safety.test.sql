-- M2-Q Phase 1A: quota ledger safety regressions (owner decisions Q-D1..Q-D3:
-- keep the ledger forever, no global expiry sweep, no purge).
-- Disposable DB only; migrations through 20261117000000. Everything rolls back.
-- Parallel two-tab / replay checks: scripts/db-m2q-quota-safety.ts (PostgREST).
-- Design: docs/audits/2026-11-18-m2q-quota-ledger-reliability-audit.md
BEGIN;

CREATE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
 PERFORM set_config('request.jwt.claim.sub', u::text, true);
 PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END $$;

-- Runs every scheduled job command, so a future cleanup job is exercised
-- without editing this file. storage-cleanup is skipped: it only calls an HTTP
-- endpoint (its body is covered by the static check in S1).
CREATE FUNCTION pg_temp.run_maintenance() RETURNS void LANGUAGE plpgsql AS $$
DECLARE cmd text; n int := 0;
BEGIN
 IF to_regclass('cron.job') IS NULL THEN
   PERFORM public.purge_expired_api_rate_limits();
   PERFORM public.purge_expired_free_history();
   RETURN;
 END IF;
 -- Production runs with analysis_log retention enabled; run that job for real
 -- too (this whole file rolls back).
 UPDATE public.app_settings SET value = 'true'::jsonb WHERE key = 'analysis_log_retention_enabled';
 FOR cmd IN SELECT command FROM cron.job WHERE jobname <> 'storage-cleanup' ORDER BY jobname LOOP
   EXECUTE cmd;
   n := n + 1;
 END LOOP;
 ASSERT n >= 2, 'expected the purge-free-history and purge-api-rate-limits jobs, ran '||n;
END $$;

-- ── S1. No cleanup process can delete ledger rows ─────────────────────────
DO $$
DECLARE
 ledger regclass := 'public.analytics_quota_reservations'::regclass;
 offenders text;
BEGIN
 SELECT string_agg(p.oid::regprocedure::text, ', ') INTO offenders
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND p.prosrc ~* '(delete\s+from|truncate(\s+table)?)\s+(only\s+)?("?public"?\.)?"?analytics_quota_reservations';
 ASSERT offenders IS NULL, 'functions delete ledger rows: '||offenders;

 IF to_regclass('cron.job') IS NOT NULL THEN
   SELECT string_agg(jobname, ', ') INTO offenders FROM cron.job WHERE command ILIKE '%analytics_quota_reservations%';
   ASSERT offenders IS NULL, 'cron jobs touch the ledger: '||offenders;
   ASSERT (SELECT count(*) FROM cron.job) > 0, 'cron jobs expected in a full replay (static check would be vacuous)';
 END IF;

 ASSERT NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ledger AND NOT tgisinternal), 'trigger on the ledger';
 ASSERT NOT EXISTS (SELECT 1 FROM pg_rewrite WHERE ev_class = ledger AND rulename <> '_RETURN'), 'rule on the ledger';
 ASSERT NOT EXISTS (SELECT 1 FROM pg_constraint WHERE confrelid = ledger), 'another table references the ledger';
 -- The only cascade path is account deletion (profiles).
 ASSERT (SELECT string_agg(confrelid::regclass::text || ':' || confdeltype::text, ',')
           FROM pg_constraint WHERE conrelid = ledger AND contype = 'f') = 'profiles:c',
        'ledger foreign keys changed';
 FOREACH offenders IN ARRAY ARRAY['anon', 'authenticated'] LOOP
   ASSERT NOT has_table_privilege(offenders, ledger, 'DELETE'), offenders||' can delete ledger rows';
   ASSERT NOT has_table_privilege(offenders, ledger, 'TRUNCATE'), offenders||' can truncate the ledger';
 END LOOP;
END $$;

-- ── S2. A candidate that is not done keeps its ledger evidence ────────────
DO $$
DECLARE
 u uuid := gen_random_uuid();
 k uuid; c uuid[] := ARRAY[]::uuid[]; cc uuid;
 a uuid[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
 j jsonb; i int; n_before int;
BEGIN
 INSERT INTO auth.users(id) VALUES (u);
 INSERT INTO public.profiles(id,email,role,plan,has_permission,quota_reset_day,usage_count,usage_month,
                             monthly_analytics_limit_custom,monthly_analytics_limit)
 VALUES (u,'m2q-s2@example.test','user','recruiter',true,1,0,public.current_quota_cycle(1::smallint),true,50);
 PERFORM pg_temp.as_user(u);
 INSERT INTO public.recruitment_campaigns(user_id,title,jd_title,jd_content) VALUES (u,'t','t','jd') RETURNING id INTO k;
 FOR i IN 1..3 LOOP
   INSERT INTO public.candidate_cvs(campaign_id,candidate_name,file_name,file_path,file_size)
   VALUES (k,'c'||i,'c.txt',u::text||'/campaigns/x/'||i||'.txt',1) RETURNING id INTO cc;
   c := c || cc;
   j := public.claim_candidate_analysis(cc, a[i], false);
   ASSERT j->>'result' = 'claimed', 'claim '||i||': '||j::text;
   j := public.reserve_analytics_quota(u, a[i]);
   ASSERT j->>'status' = 'reserved', 'reserve '||i||': '||j::text;
 END LOOP;

 -- 1: Gemini delivered, commit recorded, save never landed, client released the row.
 j := public.commit_analytics_quota(u, (SELECT id FROM public.analytics_quota_reservations WHERE request_key=a[1]));
 ASSERT j->>'status' = 'committed', j::text;
 UPDATE public.candidate_cvs SET status='error', error_message='save failed' WHERE id=c[1] AND analysis_attempt_id=a[1];
 -- 2: outcome unknown.
 j := public.release_analytics_quota(u, (SELECT id FROM public.analytics_quota_reservations WHERE request_key=a[2]), 'uncertain');
 ASSERT j->>'status' = 'uncertain', j::text;
 -- 3: server died: reservation never settled and is now expired; row stays analyzing past its lease.
 UPDATE public.analytics_quota_reservations SET expires_at = now() - interval '1 day' WHERE request_key=a[3];
 UPDATE public.candidate_cvs SET analysis_started_at = now() - interval '1 day' WHERE id = ANY(c);

 -- Everything that runs afterwards: later analyses (each sweeps expiry), maintenance jobs.
 SELECT count(*) INTO n_before FROM public.analytics_quota_reservations WHERE user_id=u;
 FOR i IN 1..3 LOOP
   j := public.reserve_analytics_quota(u, gen_random_uuid());
   PERFORM public.commit_analytics_quota(u, (j->>'reservation_id')::uuid);
 END LOOP;
 PERFORM pg_temp.run_maintenance();

 ASSERT (SELECT count(*) FROM public.analytics_quota_reservations WHERE request_key = ANY(a)) = 3, 'open-candidate evidence deleted';
 ASSERT (SELECT count(*) FROM public.analytics_quota_reservations WHERE user_id=u) = n_before + 3, 'ledger rows lost';
 ASSERT (SELECT state FROM public.analytics_quota_reservations WHERE request_key=a[3]) = 'uncertain', 'expired row must be settled, not deleted';

 -- The evidence still drives the claim decision (no silent re-run).
 PERFORM pg_temp.as_user(u);
 j := public.claim_candidate_analysis(c[1], gen_random_uuid(), false);
 ASSERT j->>'result' = 'needs_confirm' AND j->>'reason' = 'paid_result_lost', 'c1: '||j::text;
 j := public.claim_candidate_analysis(c[2], gen_random_uuid(), false);
 ASSERT j->>'result' = 'needs_confirm' AND j->>'reason' = 'outcome_unknown', 'c2: '||j::text;
 j := public.claim_candidate_analysis(c[3], gen_random_uuid(), false);
 ASSERT j->>'result' = 'needs_confirm' AND j->>'reason' = 'outcome_unknown', 'c3: '||j::text;
END $$;

-- ── S3. An expired reservation is never deleted (and not swept globally) ──
DO $$
DECLARE
 gone uuid := gen_random_uuid();   -- never comes back
 back uuid := gen_random_uuid();   -- keeps using the app
 r uuid; j jsonb; i int;
BEGIN
 INSERT INTO auth.users(id) VALUES (gone), (back);
 INSERT INTO public.profiles(id,email,role,plan,has_permission,quota_reset_day,usage_count,usage_month,
                             monthly_analytics_limit_custom,monthly_analytics_limit)
 VALUES (gone,'m2q-s3a@example.test','user','free',true,1,0,public.current_quota_cycle(1::smallint),true,5),
        (back,'m2q-s3b@example.test','user','free',true,1,0,public.current_quota_cycle(1::smallint),true,50);
 j := public.reserve_analytics_quota(gone, gen_random_uuid(), 1);
 r := (j->>'reservation_id')::uuid;
 UPDATE public.analytics_quota_reservations SET expires_at = now() - interval '400 days', created_at = now() - interval '400 days' WHERE id = r;

 FOR i IN 1..5 LOOP
   j := public.reserve_analytics_quota(back, gen_random_uuid());
   PERFORM public.release_analytics_quota(back, (j->>'reservation_id')::uuid, 'pre_gemini');
 END LOOP;
 PERFORM pg_temp.run_maintenance();

 ASSERT EXISTS (SELECT 1 FROM public.analytics_quota_reservations WHERE id = r), 'expired reservation deleted';
 ASSERT (SELECT state FROM public.analytics_quota_reservations WHERE id = r) = 'reserved',
        'another user''s activity settled this row (global sweep, Q-D2)';
 ASSERT (SELECT usage_count FROM public.profiles WHERE id = gone) = 0, 'idle user charged';

 -- Only the owner's own next reserve settles it, and the row stays.
 PERFORM public.reserve_analytics_quota(gone, gen_random_uuid());
 ASSERT (SELECT state FROM public.analytics_quota_reservations WHERE id = r) = 'uncertain', 'own reserve must settle';
 ASSERT (SELECT count(*) FROM public.analytics_quota_reservations WHERE user_id = gone) = 2, 'settled row deleted';
END $$;

-- ── S4. Replaying a request key never creates another charge ──────────────
DO $$
DECLARE
 u uuid := gen_random_uuid();
 k_commit uuid := gen_random_uuid(); k_refund uuid := gen_random_uuid();
 k_unc uuid := gen_random_uuid(); k_exp uuid := gen_random_uuid();
 r uuid; j jsonb; i int;
BEGIN
 INSERT INTO auth.users(id) VALUES (u);
 INSERT INTO public.profiles(id,email,role,plan,has_permission,quota_reset_day,usage_count,usage_month,
                             monthly_analytics_limit_custom,monthly_analytics_limit)
 VALUES (u,'m2q-s4@example.test','user','free',true,1,0,public.current_quota_cycle(1::smallint),true,10);

 j := public.reserve_analytics_quota(u, k_commit); r := (j->>'reservation_id')::uuid;
 j := public.reserve_analytics_quota(u, k_commit);
 ASSERT j->>'status' = 'duplicate' AND j->>'state' = 'reserved', 'in-flight replay: '||j::text;
 j := public.commit_analytics_quota(u, r); ASSERT (j->>'charged')::boolean, j::text;
 FOR i IN 1..5 LOOP
   j := public.reserve_analytics_quota(u, k_commit);
   ASSERT j->>'status' = 'duplicate' AND j->>'state' = 'committed', 'committed replay '||i||': '||j::text;
   j := public.commit_analytics_quota(u, r);
   ASSERT (j->>'replay')::boolean, 'commit replay '||i||': '||j::text;
 END LOOP;
 ASSERT (SELECT usage_count FROM public.profiles WHERE id=u) = 1, 'replay charged again';

 j := public.reserve_analytics_quota(u, k_refund);
 PERFORM public.release_analytics_quota(u, (j->>'reservation_id')::uuid, 'pre_gemini');
 j := public.reserve_analytics_quota(u, k_refund);
 ASSERT j->>'status' = 'duplicate' AND j->>'state' = 'refunded', 'refunded replay: '||j::text;

 j := public.reserve_analytics_quota(u, k_unc);
 PERFORM public.release_analytics_quota(u, (j->>'reservation_id')::uuid, 'uncertain');
 j := public.reserve_analytics_quota(u, k_unc);
 ASSERT j->>'status' = 'duplicate' AND j->>'state' = 'uncertain', 'uncertain replay: '||j::text;

 j := public.reserve_analytics_quota(u, k_exp, 1);
 UPDATE public.analytics_quota_reservations SET expires_at = now() - interval '1 minute' WHERE request_key = k_exp;
 j := public.reserve_analytics_quota(u, k_exp);   -- sweeps the row, then dedupes on it
 ASSERT j->>'status' = 'duplicate' AND j->>'state' = 'uncertain', 'expired replay: '||j::text;

 ASSERT (SELECT count(*) FROM public.analytics_quota_reservations WHERE user_id=u) = 4, 'replay inserted a reservation';
 -- Two forgiven uncertain rows (K = 2), one committed charge.
 ASSERT (SELECT usage_count FROM public.profiles WHERE id=u) = 1, 'replays changed usage';
END $$;

SELECT 'm2q_quota_safety.test.sql: all assertions passed' AS result;
ROLLBACK;
