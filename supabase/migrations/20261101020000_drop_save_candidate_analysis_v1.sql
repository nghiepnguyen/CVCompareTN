-- P1-1 step 2. APPLY ONLY AFTER the app that passes p_user_id is deployed
-- (older app calls the 4-arg function and would break).
DROP FUNCTION public.save_candidate_analysis(uuid, jsonb, integer, text);
