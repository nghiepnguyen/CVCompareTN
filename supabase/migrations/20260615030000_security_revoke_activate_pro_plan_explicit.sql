-- Security: explicitly revoke anon + authenticated from activate_pro_plan.
-- CREATE OR REPLACE FUNCTION grants EXECUTE to PUBLIC by default on Supabase,
-- so REVOKE FROM PUBLIC alone is insufficient — must also revoke from anon and authenticated explicitly.

REVOKE ALL ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb, text)
  FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb, text)
  TO service_role;
