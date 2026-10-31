-- §4.5b: enforce MAX_CAMPAIGNS (10) for the Recruiter plan at the database
-- boundary. The trigger already blocked non-recruiter plans; a recruiter could
-- still create unlimited campaigns through PostgREST. This adds the count
-- check (all statuses count, matching ProfileView's "used" number) while
-- keeping admins exempt and service_role/SECURITY DEFINER callers untouched.
-- The client UI disables campaign creation at the same limit; this migration
-- is the authoritative guard for direct API calls.

CREATE OR REPLACE FUNCTION public.enforce_plan_caps()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_user uuid;
  v_plan text;
  v_role text;
  v_max integer;
  v_count integer;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'candidate_cvs' THEN
    SELECT c.user_id INTO v_user FROM public.recruitment_campaigns AS c WHERE c.id = NEW.campaign_id;
  ELSE
    v_user := NEW.user_id;
  END IF;
  IF v_user IS NULL THEN
    RETURN NEW; -- RLS / FK reject it
  END IF;

  -- Serialize concurrent inserts per user so count-then-insert cannot overshoot.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  -- Same plan rule as storage_publish_upload: admin counts as pro, expired paid plan as free.
  SELECT CASE WHEN p.role = 'admin' THEN 'pro'
              WHEN p.plan_expires_at IS NOT NULL AND p.plan_expires_at < now() THEN 'free'
              ELSE p.plan END,
         p.role
    INTO v_plan, v_role
    FROM public.profiles AS p WHERE p.id = v_user;
  v_plan := coalesce(v_plan, 'free');

  IF TG_TABLE_NAME = 'saved_cvs' THEN
    v_max := CASE v_plan WHEN 'recruiter' THEN 50 WHEN 'pro' THEN 10 ELSE 1 END;
    SELECT count(*) INTO v_count FROM public.saved_cvs WHERE user_id = v_user;
    IF v_count >= v_max THEN
      RAISE EXCEPTION 'Saved CV limit reached' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'saved_jds' THEN
    IF v_plan = 'free' THEN
      SELECT count(*) INTO v_count FROM public.saved_jds WHERE user_id = v_user;
      IF v_count >= 3 THEN
        RAISE EXCEPTION 'Saved JD limit reached' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'recruitment_campaigns' THEN
    IF v_plan <> 'recruiter' AND v_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Recruiter plan required' USING ERRCODE = '42501';
    END IF;
    IF v_plan = 'recruiter' AND v_role IS DISTINCT FROM 'admin' THEN
      SELECT count(*) INTO v_count FROM public.recruitment_campaigns WHERE user_id = v_user;
      IF v_count >= 10 THEN
        RAISE EXCEPTION 'Campaign limit reached' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'candidate_cvs' THEN
    IF v_plan <> 'recruiter' AND v_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Recruiter plan required' USING ERRCODE = '42501';
    END IF;
    SELECT count(*) INTO v_count FROM public.candidate_cvs WHERE campaign_id = NEW.campaign_id;
    IF v_count >= 50 THEN
      RAISE EXCEPTION 'Campaign CV limit reached' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_plan_caps() FROM PUBLIC, anon, authenticated;
