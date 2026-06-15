-- Security: fix mutable search_path on effective_plan_from_row.
-- Supabase Linter finding: function_search_path_mutable.
-- Without SET search_path, a superuser could inject a malicious schema
-- into the search path and shadow public functions.

ALTER FUNCTION public.effective_plan_from_row SET search_path = public;
