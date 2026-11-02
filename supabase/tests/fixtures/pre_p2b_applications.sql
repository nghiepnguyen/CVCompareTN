-- Pre-P2B state for the backfill test: run by FIXTURE_BEFORE just before
-- 20261104000000_application_tracker.sql, i.e. against the P2A schema only.
INSERT INTO auth.users(id) VALUES ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
INSERT INTO public.profiles(id,role,has_permission,plan) VALUES
 ('11111111-1111-4111-8111-111111111111','user',true,'free'), ('22222222-2222-4222-8222-222222222222','user',true,'free');
INSERT INTO public.applications(id,user_id,idempotency_key,language,role_title,created_at,updated_at)
SELECT ('aaaaaaaa-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
       CASE WHEN g % 2 = 0 THEN '11111111-1111-4111-8111-111111111111'::uuid ELSE '22222222-2222-4222-8222-222222222222'::uuid END,
       gen_random_uuid(), 'vi', 'Role ' || g, '2026-11-02 10:00:00+00'::timestamptz + g * interval '1 minute',
       '2026-11-02 10:00:00+00'::timestamptz + g * interval '1 minute'
FROM generate_series(1, 25) g;
INSERT INTO public.application_documents(application_id,user_id,document_type,content,metadata)
SELECT a.id, a.user_id, t.type, jsonb_build_object('text', 'snapshot ' || a.role_title), '{"snapshotVersion":1}'
FROM public.applications a CROSS JOIN (VALUES ('cv'), ('jd')) AS t(type);
CREATE TABLE public.zz_pre_p2b_snapshot AS
SELECT a.id, a.status, a.updated_at, a.created_at, (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.document_type) FROM public.application_documents d WHERE d.application_id = a.id) AS docs
FROM public.applications a;
