-- Recruiter plan: recruitment_campaigns + candidate_cvs
-- Requires plan column already exists (20260601000000_add_plan_to_profiles.sql)

-- -----------------------------------------------------------------------------
-- Extend profiles.plan CHECK constraint to include 'recruiter'
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check,
  ADD CONSTRAINT profiles_plan_check
    CHECK (plan IN ('free', 'pro', 'recruiter'));

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recruitment_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  jd_title text NOT NULL DEFAULT '',
  jd_content text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed', 'archived')),
  candidate_count integer NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  analyzed_count integer NOT NULL DEFAULT 0 CHECK (analyzed_count >= 0),
  shortlisted_count integer NOT NULL DEFAULT 0 CHECK (shortlisted_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.recruitment_campaigns IS 'Recruiter hiring campaigns (one JD, many CVs).';
COMMENT ON COLUMN public.recruitment_campaigns.candidate_count IS 'Cache: total number of candidate CVs in this campaign.';
COMMENT ON COLUMN public.recruitment_campaigns.analyzed_count IS 'Cache: number of CVs with status = done.';
COMMENT ON COLUMN public.recruitment_campaigns.shortlisted_count IS 'Cache: number of CVs with hr_status = shortlisted.';

CREATE TABLE IF NOT EXISTS public.candidate_cvs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.recruitment_campaigns(id) ON DELETE CASCADE,
  candidate_name text NOT NULL DEFAULT '',
  file_name text NOT NULL DEFAULT '',
  file_path text NOT NULL DEFAULT '',
  file_size integer NOT NULL DEFAULT 0 CHECK (file_size >= 0),
  parsed_text text,
  analysis_result jsonb,
  match_score integer CHECK (match_score >= 0 AND match_score <= 100),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'analyzing', 'done', 'error')),
  error_message text,
  hr_status text NOT NULL DEFAULT 'new'
    CHECK (hr_status IN ('new', 'shortlisted', 'interviewing', 'rejected', 'hired')),
  hr_note text,
  analyzed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.candidate_cvs IS 'Individual candidate CVs within a recruitment campaign.';
COMMENT ON COLUMN public.candidate_cvs.parsed_text IS 'Extracted text, cached to avoid re-parsing.';
COMMENT ON COLUMN public.candidate_cvs.analysis_result IS 'Full Gemini analysis response (same shape as history).';
COMMENT ON COLUMN public.candidate_cvs.match_score IS '0–100 match score, indexed for fast sorting.';
COMMENT ON COLUMN public.candidate_cvs.hr_status IS 'HR pipeline stage: new, shortlisted, interviewing, rejected, hired.';

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS campaigns_user_id_created_idx
  ON public.recruitment_campaigns (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS candidates_campaign_score_idx
  ON public.candidate_cvs (campaign_id, match_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS candidates_campaign_hr_status_idx
  ON public.candidate_cvs (campaign_id, hr_status);

CREATE INDEX IF NOT EXISTS candidates_campaign_status_idx
  ON public.candidate_cvs (campaign_id, status);

-- -----------------------------------------------------------------------------
-- RLS: recruitment_campaigns — owner only
-- -----------------------------------------------------------------------------
ALTER TABLE public.recruitment_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaigns_select_own" ON public.recruitment_campaigns;
DROP POLICY IF EXISTS "campaigns_insert_own" ON public.recruitment_campaigns;
DROP POLICY IF EXISTS "campaigns_update_own" ON public.recruitment_campaigns;
DROP POLICY IF EXISTS "campaigns_delete_own" ON public.recruitment_campaigns;

CREATE POLICY "campaigns_select_own"
  ON public.recruitment_campaigns FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "campaigns_insert_own"
  ON public.recruitment_campaigns FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "campaigns_update_own"
  ON public.recruitment_campaigns FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "campaigns_delete_own"
  ON public.recruitment_campaigns FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- RLS: candidate_cvs — campaign owner only (via EXISTS subquery)
-- -----------------------------------------------------------------------------
ALTER TABLE public.candidate_cvs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "candidates_select_own" ON public.candidate_cvs;
DROP POLICY IF EXISTS "candidates_insert_own" ON public.candidate_cvs;
DROP POLICY IF EXISTS "candidates_update_own" ON public.candidate_cvs;
DROP POLICY IF EXISTS "candidates_delete_own" ON public.candidate_cvs;

CREATE POLICY "candidates_select_own"
  ON public.candidate_cvs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.recruitment_campaigns AS c
      WHERE c.id = candidate_cvs.campaign_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "candidates_insert_own"
  ON public.candidate_cvs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recruitment_campaigns AS c
      WHERE c.id = candidate_cvs.campaign_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "candidates_update_own"
  ON public.candidate_cvs FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.recruitment_campaigns AS c
      WHERE c.id = candidate_cvs.campaign_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recruitment_campaigns AS c
      WHERE c.id = candidate_cvs.campaign_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "candidates_delete_own"
  ON public.candidate_cvs FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.recruitment_campaigns AS c
      WHERE c.id = candidate_cvs.campaign_id AND c.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- RPC: sync_campaign_counters — internal use only
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_campaign_counters(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_done integer;
  v_shortlisted integer;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE status = 'done'),
         COUNT(*) FILTER (WHERE hr_status = 'shortlisted')
  INTO v_total, v_done, v_shortlisted
  FROM public.candidate_cvs
  WHERE campaign_id = p_campaign_id;

  UPDATE public.recruitment_campaigns SET
    candidate_count = COALESCE(v_total, 0),
    analyzed_count = COALESCE(v_done, 0),
    shortlisted_count = COALESCE(v_shortlisted, 0),
    updated_at = now()
  WHERE id = p_campaign_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_campaign_counters(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_campaign_counters(uuid) TO authenticated;

COMMENT ON FUNCTION public.sync_campaign_counters(uuid) IS
  'Sync candidate_count, analyzed_count, shortlisted_count from candidate_cvs to recruitment_campaigns.';

-- -----------------------------------------------------------------------------
-- RPC: update_candidate_hr_status — set hr_status + hr_note, auto sync counters
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_candidate_hr_status(
  p_candidate_id uuid,
  p_hr_status text,
  p_hr_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id uuid;
BEGIN
  -- Verify ownership via EXISTS subquery on candidate_cvs → recruitment_campaigns
  SELECT cc.campaign_id INTO v_campaign_id
  FROM public.candidate_cvs AS cc
  WHERE cc.id = p_candidate_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.recruitment_campaigns AS c
    WHERE c.id = v_campaign_id AND c.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  IF p_hr_status NOT IN ('new', 'shortlisted', 'interviewing', 'rejected', 'hired') THEN
    RAISE EXCEPTION 'invalid_hr_status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.candidate_cvs SET
    hr_status = p_hr_status,
    hr_note = COALESCE(p_hr_note, hr_note)
  WHERE id = p_candidate_id;

  PERFORM public.sync_campaign_counters(v_campaign_id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_candidate_hr_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_candidate_hr_status(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.update_candidate_hr_status(uuid, text, text) IS
  'Set hr_status (and optionally hr_note) on a candidate CV, then sync campaign counters.';

-- -----------------------------------------------------------------------------
-- RPC: save_candidate_analysis — service_role only, save Gemini result
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_candidate_analysis(
  p_candidate_id uuid,
  p_analysis_result jsonb,
  p_match_score integer,
  p_status text DEFAULT 'done'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id uuid;
BEGIN
  IF p_match_score < 0 OR p_match_score > 100 THEN
    RAISE EXCEPTION 'invalid_match_score' USING ERRCODE = '22023';
  END IF;

  IF p_status NOT IN ('done', 'error') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.candidate_cvs SET
    analysis_result = p_analysis_result,
    match_score = p_match_score,
    status = p_status,
    analyzed_at = CASE WHEN p_status = 'done' THEN now() ELSE analyzed_at END,
    error_message = CASE WHEN p_status = 'error' THEN p_analysis_result->>'error' ELSE NULL END
  WHERE id = p_candidate_id
  RETURNING campaign_id INTO v_campaign_id;

  IF FOUND THEN
    PERFORM public.sync_campaign_counters(v_campaign_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_candidate_analysis(uuid, jsonb, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_candidate_analysis(uuid, jsonb, integer, text) TO service_role;

COMMENT ON FUNCTION public.save_candidate_analysis(uuid, jsonb, integer, text) IS
  'Save Gemini analysis result to a candidate CV. service_role only — never called directly from client.';

-- -----------------------------------------------------------------------------
-- RPC: check_analytics_quota — add recruiter branch (500 quota)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_analytics_quota(
  p_user_id uuid,
  p_additional integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text := public.current_usage_month();
  v_used integer;
  v_custom boolean;
  v_stored_limit integer;
  v_limit integer;
  v_effective_plan text;
  v_row_plan text;
  v_expires_at timestamptz;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  PERFORM public.sync_profile_usage_month(p_user_id);

  SELECT p.usage_count,
         p.monthly_analytics_limit_custom,
         p.monthly_analytics_limit,
         p.plan,
         p.plan_expires_at
  INTO v_used, v_custom, v_stored_limit, v_row_plan, v_expires_at
  FROM public.profiles AS p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', 0,
      'limit', null,
      'month', v_month,
      'plan', 'free',
      'reason', 'profile_not_found'
    );
  END IF;

  v_effective_plan := public.effective_plan_from_row(v_row_plan, v_expires_at);
  v_limit := public.resolve_monthly_analytics_limit(v_effective_plan, v_custom, v_stored_limit);

  IF v_limit IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'used', v_used,
      'limit', null,
      'month', v_month,
      'plan', v_effective_plan
    );
  END IF;

  IF v_used + GREATEST(p_additional, 0) > v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', v_used,
      'limit', v_limit,
      'month', v_month,
      'plan', v_effective_plan,
      'reason', 'monthly_limit_exceeded'
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'used', v_used,
    'limit', v_limit,
    'month', v_month,
    'plan', v_effective_plan
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: resolve_monthly_analytics_limit — add recruiter branch (500)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_monthly_analytics_limit(
  p_effective_plan text,
  p_custom boolean,
  p_stored_limit integer
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_custom AND p_stored_limit IS NULL THEN NULL
    WHEN p_effective_plan = 'recruiter' THEN 500
    WHEN p_effective_plan = 'pro' THEN 100
    ELSE public.effective_monthly_analytics_limit(p_custom, p_stored_limit)
  END;
$$;

-- -----------------------------------------------------------------------------
-- Update effective_plan_from_row to support recruiter
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.effective_plan_from_row(
  p_plan text,
  p_expires_at timestamptz
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN (p_plan = 'pro' OR p_plan = 'recruiter') AND (p_expires_at IS NULL OR p_expires_at > now())
      THEN p_plan
    ELSE 'free'
  END;
$$;

-- -----------------------------------------------------------------------------
-- Update get_user_plan to support recruiter plan return
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_plan(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.effective_plan_from_row(p.plan, p.plan_expires_at)
  FROM public.profiles AS p
  WHERE p.id = p_user_id;
$$;

-- -----------------------------------------------------------------------------
-- Update activate_pro_plan: accept plan_type parameter (pro / recruiter)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.activate_pro_plan(uuid, bigint, integer, jsonb);

CREATE OR REPLACE FUNCTION public.activate_pro_plan(
  p_user_id uuid,
  p_order_code bigint,
  p_duration_days integer DEFAULT 30,
  p_payos_data jsonb DEFAULT NULL,
  p_plan text DEFAULT 'pro'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed_user_id uuid;
  v_duration integer;
BEGIN
  IF p_plan NOT IN ('pro', 'recruiter') THEN
    RAISE EXCEPTION 'invalid_plan_type' USING ERRCODE = '22023';
  END IF;

  UPDATE public.payments AS pay
  SET
    status = 'paid',
    paid_at = now(),
    payos_data = COALESCE(p_payos_data, pay.payos_data)
  WHERE pay.order_code = p_order_code
    AND pay.user_id = p_user_id
    AND pay.status = 'pending'
  RETURNING pay.user_id, pay.duration_days
  INTO v_claimed_user_id, v_duration;

  IF v_claimed_user_id IS NULL THEN
    RETURN false;
  END IF;

  v_duration := COALESCE(NULLIF(v_duration, 0), NULLIF(p_duration_days, 0), 30);

  UPDATE public.profiles AS p SET
    plan = p_plan,
    plan_expires_at = CASE
      WHEN p.plan = p_plan AND (p.plan_expires_at IS NULL OR p.plan_expires_at > now())
        THEN COALESCE(p.plan_expires_at, now()) + (v_duration || ' days')::interval
      ELSE now() + (v_duration || ' days')::interval
    END,
    plan_updated_at = now(),
    usage_count = 0,
    usage_month = public.current_usage_month()
  WHERE p.id = v_claimed_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb, text) TO service_role;

COMMENT ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb, text) IS
  'Claims pending payment then extends pro/recruiter. Returns true if activated, false if order already paid or not pending.';

-- -----------------------------------------------------------------------------
-- Update admin_set_user_plan to support recruiter plan
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_plan(
  p_user_id uuid,
  p_plan text,
  p_duration_days integer DEFAULT 30
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  IF p_plan NOT IN ('free', 'pro', 'recruiter') THEN
    RAISE EXCEPTION 'invalid_plan' USING ERRCODE = '22023';
  END IF;

  IF p_plan = 'free' THEN
    UPDATE public.profiles SET
      plan = 'free',
      plan_expires_at = NULL,
      plan_updated_at = now()
    WHERE id = p_user_id;
    RETURN;
  END IF;

  IF p_duration_days IS NULL OR p_duration_days < 1 THEN
    RAISE EXCEPTION 'invalid_duration' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles SET
    plan = p_plan,
    plan_expires_at = CASE
      WHEN plan = p_plan AND (plan_expires_at IS NULL OR plan_expires_at > now())
        THEN COALESCE(plan_expires_at, now()) + (p_duration_days || ' days')::interval
      ELSE now() + (p_duration_days || ' days')::interval
    END,
    plan_updated_at = now(),
    usage_count = 0,
    usage_month = public.current_usage_month()
  WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.admin_set_user_plan(uuid, text, integer) IS
  'Admin-only: set user plan to free/pro/recruiter for p_duration_days.';

-- -----------------------------------------------------------------------------
-- Update payments.plan CHECK constraint to include recruiter
-- -----------------------------------------------------------------------------
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_plan_check,
  ADD CONSTRAINT payments_plan_check
    CHECK (plan IN ('free', 'pro', 'recruiter'));