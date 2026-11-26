-- Pre-D1 state for the retention migration: run by FIXTURE_BEFORE just before
-- 20261126000000_analysis_log_retention_disabled.sql. Old and recent
-- analysis_log rows plus related user data, and a snapshot to compare against.
INSERT INTO auth.users(id) VALUES ('33333333-3333-4333-8333-333333333333');
INSERT INTO public.profiles(id, role, has_permission, plan, usage_count)
  VALUES ('33333333-3333-4333-8333-333333333333', 'user', true, 'free', 2);
INSERT INTO public.history(user_id, analysis_id, timestamp)
  VALUES ('33333333-3333-4333-8333-333333333333', 'pre-d1-history', now() - interval '500 days');
INSERT INTO public.analysis_log(user_id, status, kind, created_at, input_tokens, output_tokens, model, latency_ms, error_message, guard_metrics)
SELECT CASE WHEN g % 3 = 0 THEN NULL ELSE '33333333-3333-4333-8333-333333333333'::uuid END,
       CASE WHEN g % 4 = 0 THEN 'error' ELSE 'success' END, 'analyze',
       now() - make_interval(days => g * 7), g, g, 'm', g * 10,
       CASE WHEN g % 4 = 0 THEN '[upstream]' END, '{"v":1}'
FROM generate_series(0, 60) AS g;   -- 0 .. 420 days old; 48 rows older than 90 days
CREATE TABLE public.zz_pre_d1_snapshot AS
SELECT (SELECT count(*) FROM public.analysis_log) AS log_rows,
       (SELECT count(*) FROM public.analysis_log WHERE created_at < now() - interval '90 days') AS log_old_rows,
       (SELECT md5(string_agg(concat_ws('|', id, user_id, status, kind, created_at, input_tokens, output_tokens, model, latency_ms, error_message, guard_metrics::text), ',' ORDER BY id)) FROM public.analysis_log) AS log_md5,
       (SELECT md5(string_agg(concat_ws('|', user_id, analysis_id, timestamp), ',' ORDER BY analysis_id)) FROM public.history) AS history_md5,
       (SELECT md5(string_agg(concat_ws('|', id, plan, usage_count), ',' ORDER BY id)) FROM public.profiles) AS profiles_md5;
