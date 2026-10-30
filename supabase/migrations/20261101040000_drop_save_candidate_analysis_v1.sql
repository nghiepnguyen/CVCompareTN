-- Follow-up to 20261101010000: the deployed app now calls the 5-arg
-- save_candidate_analysis(p_user_id, ...). Drop the 4-arg v1 that has no ownership check.
DROP FUNCTION public.save_candidate_analysis(uuid, jsonb, integer, text);
