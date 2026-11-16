-- M2-C2: atomic monthly analytics quota (reserve → commit | release).
-- Design: docs/audits/2026-11-15-m2c1-monthly-quota-integrity-design.md (+ M2-C2 amendments).
--
-- profiles.usage_count stays the committed counter (UI, admin report and
-- effective_usage_count are unchanged). This ledger only adds in-flight and
-- uncertain state. Every RPC locks the caller's profiles row FIRST, then
-- touches reservations, so all quota decisions for one user are serialized.
-- Plan quota numbers are not changed. The legacy check_analytics_quota /
-- increment_usage_count RPCs are left untouched for app rollback.

CREATE TABLE IF NOT EXISTS public.analytics_quota_reservations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  cycle       text NOT NULL,
  state       text NOT NULL DEFAULT 'reserved'
              CHECK (state IN ('reserved', 'committed', 'refunded', 'uncertain')),
  charged     boolean NOT NULL DEFAULT false,
  forgiven    boolean NOT NULL DEFAULT false,
  outcome     text CHECK (outcome IS NULL OR char_length(outcome) <= 64),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  settled_at  timestamptz,
  CONSTRAINT analytics_quota_reservations_user_key_unique UNIQUE (user_id, request_key),
  -- A forgiven row is uncertain and uncharged; a charged row is never forgiven.
  CONSTRAINT analytics_quota_reservations_forgiven_shape
    CHECK (NOT forgiven OR (state = 'uncertain' AND NOT charged)),
  CONSTRAINT analytics_quota_reservations_settled_shape
    CHECK ((state = 'reserved') = (settled_at IS NULL))
);

CREATE INDEX IF NOT EXISTS analytics_quota_reservations_user_cycle_state_idx
  ON public.analytics_quota_reservations (user_id, cycle, state);

COMMENT ON TABLE public.analytics_quota_reservations IS
  'M2-C2 monthly analytics quota ledger. Service-role only. reserved = holds capacity until committed/released/expired; uncertain = Gemini outcome unknown (first 2 per cycle forgiven, then charged).';

ALTER TABLE public.analytics_quota_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_quota_reservations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.analytics_quota_reservations TO service_role;

-- Uncertain requests forgiven per user per quota cycle (owner decision D1, K = 2).
CREATE OR REPLACE FUNCTION public.analytics_quota_forgiven_per_cycle()
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 2 $$;

-- Internal: lock the profile row, roll the cycle, and return the quota state.
-- Caller must already be inside a definer RPC; never exposed.
CREATE OR REPLACE FUNCTION public.analytics_quota_lock_state(
  p_user_id uuid,
  OUT profile_found boolean,
  OUT usage_count integer,
  OUT quota_limit integer,
  OUT cycle text
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_row record;
BEGIN
  PERFORM 1 FROM public.profiles AS p WHERE p.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    profile_found := false;
    RETURN;
  END IF;

  -- Existing lazy rollover/expiry rules, applied while we hold the lock.
  PERFORM public.sync_profile_usage_month(p_user_id);

  SELECT p.usage_count, p.monthly_analytics_limit_custom, p.monthly_analytics_limit,
         p.plan, p.role, p.plan_expires_at, p.quota_reset_day
    INTO v_row
    FROM public.profiles AS p
   WHERE p.id = p_user_id;

  profile_found := true;
  usage_count := COALESCE(v_row.usage_count, 0);
  cycle := public.current_quota_cycle((COALESCE(v_row.quota_reset_day, 1))::smallint);
  quota_limit := CASE
    WHEN v_row.role = 'admin' THEN NULL
    ELSE public.resolve_monthly_analytics_limit(
      public.effective_plan_from_row(v_row.plan, v_row.plan_expires_at),
      v_row.monthly_analytics_limit_custom,
      v_row.monthly_analytics_limit)
  END;
END;
$$;

-- Internal: settle one reserved row as uncertain (amendment A1). Caller holds
-- the profile lock and has locked the reservation row.
CREATE OR REPLACE FUNCTION public.analytics_quota_mark_uncertain(
  p_reservation_id uuid,
  p_reason text,
  p_usage_count integer,
  p_limit integer,
  p_cycle text
)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_res record;
  v_forgiven_used integer;
BEGIN
  SELECT r.user_id, r.cycle INTO v_res
    FROM public.analytics_quota_reservations AS r
   WHERE r.id = p_reservation_id;

  IF v_res.cycle IS DISTINCT FROM p_cycle THEN
    UPDATE public.analytics_quota_reservations
       SET state = 'uncertain', outcome = p_reason || ':prior_cycle', settled_at = now()
     WHERE id = p_reservation_id;
    RETURN 'prior_cycle';
  END IF;

  IF p_limit IS NULL THEN
    UPDATE public.analytics_quota_reservations
       SET state = 'uncertain', outcome = p_reason || ':unlimited', settled_at = now()
     WHERE id = p_reservation_id;
    RETURN 'unlimited';
  END IF;

  SELECT count(*) INTO v_forgiven_used
    FROM public.analytics_quota_reservations AS r
   WHERE r.user_id = v_res.user_id AND r.cycle = p_cycle
     AND r.state = 'uncertain' AND r.forgiven;

  IF v_forgiven_used < public.analytics_quota_forgiven_per_cycle() THEN
    UPDATE public.analytics_quota_reservations
       SET state = 'uncertain', forgiven = true, outcome = p_reason || ':forgiven', settled_at = now()
     WHERE id = p_reservation_id;
    RETURN 'forgiven';
  END IF;

  IF p_usage_count + 1 > p_limit THEN
    UPDATE public.analytics_quota_reservations
       SET state = 'uncertain', outcome = p_reason || ':over_limit_waived', settled_at = now()
     WHERE id = p_reservation_id;
    RETURN 'over_limit_waived';
  END IF;

  UPDATE public.profiles SET usage_count = COALESCE(usage_count, 0) + 1, usage_month = p_cycle
   WHERE id = v_res.user_id;
  UPDATE public.analytics_quota_reservations
     SET state = 'uncertain', charged = true, outcome = p_reason || ':charged', settled_at = now()
   WHERE id = p_reservation_id;
  RETURN 'charged';
END;
$$;

-- Internal: settle this user's expired reserved rows. Caller holds the profile lock.
CREATE OR REPLACE FUNCTION public.analytics_quota_expire(p_user_id uuid, p_limit integer, p_cycle text)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_n integer := 0;
  v_usage integer;
BEGIN
  FOR v_id IN
    SELECT r.id FROM public.analytics_quota_reservations AS r
     WHERE r.user_id = p_user_id AND r.state = 'reserved' AND r.expires_at <= now()
     ORDER BY r.created_at
       FOR UPDATE
  LOOP
    SELECT COALESCE(p.usage_count, 0) INTO v_usage FROM public.profiles AS p WHERE p.id = p_user_id;
    PERFORM public.analytics_quota_mark_uncertain(v_id, 'ttl_expired', v_usage, p_limit, p_cycle);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- ── Public (service_role) RPCs ─────────────────────────────────────────────
-- p_user_id MUST come from the verified JWT on the server, never from a
-- request body: service_role bypasses auth.uid() ownership checks.

CREATE OR REPLACE FUNCTION public.reserve_analytics_quota(
  p_user_id uuid,
  p_request_key uuid,
  p_ttl_seconds integer DEFAULT 360
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_state record;
  v_existing record;
  v_active integer;
  v_usage integer;
  v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_request_key IS NULL
     OR p_ttl_seconds IS NULL OR p_ttl_seconds < 1 OR p_ttl_seconds > 900 THEN
    RAISE EXCEPTION 'invalid quota reservation arguments' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_state FROM public.analytics_quota_lock_state(p_user_id);
  IF NOT v_state.profile_found THEN
    RETURN jsonb_build_object('status', 'unavailable', 'reason', 'profile_not_found');
  END IF;

  PERFORM public.analytics_quota_expire(p_user_id, v_state.quota_limit, v_state.cycle);
  -- Expiry may have charged an uncertain row: re-read the committed counter.
  SELECT COALESCE(p.usage_count, 0) INTO v_usage FROM public.profiles AS p WHERE p.id = p_user_id;

  SELECT r.id, r.state INTO v_existing
    FROM public.analytics_quota_reservations AS r
   WHERE r.user_id = p_user_id AND r.request_key = p_request_key;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'duplicate', 'state', v_existing.state);
  END IF;

  SELECT count(*) INTO v_active
    FROM public.analytics_quota_reservations AS r
   WHERE r.user_id = p_user_id AND r.cycle = v_state.cycle AND r.state = 'reserved';

  IF v_state.quota_limit IS NOT NULL AND v_usage + v_active + 1 > v_state.quota_limit THEN
    RETURN jsonb_build_object(
      'status', 'denied', 'reason', 'monthly_limit_exceeded',
      'used', v_usage, 'reserved', v_active, 'limit', v_state.quota_limit, 'cycle', v_state.cycle);
  END IF;

  INSERT INTO public.analytics_quota_reservations (user_id, request_key, cycle, expires_at)
  VALUES (p_user_id, p_request_key, v_state.cycle, now() + make_interval(secs => p_ttl_seconds))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'status', 'reserved', 'reservation_id', v_id,
    'used', v_usage, 'reserved', v_active + 1, 'limit', v_state.quota_limit, 'cycle', v_state.cycle);
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_analytics_quota(p_user_id uuid, p_reservation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_state record;
  v_res record;
BEGIN
  IF p_user_id IS NULL OR p_reservation_id IS NULL THEN
    RAISE EXCEPTION 'invalid quota commit arguments' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_state FROM public.analytics_quota_lock_state(p_user_id);
  IF NOT v_state.profile_found THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT r.* INTO v_res FROM public.analytics_quota_reservations AS r
   WHERE r.id = p_reservation_id AND r.user_id = p_user_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_res.state = 'committed' THEN
    RETURN jsonb_build_object('status', 'committed', 'charged', v_res.charged, 'replay', true);
  END IF;
  IF v_res.state = 'refunded' THEN
    RETURN jsonb_build_object('status', 'conflict', 'state', 'refunded');
  END IF;

  -- reserved | uncertain
  IF v_res.charged THEN
    -- Already charged when it became uncertain: never charge twice.
    UPDATE public.analytics_quota_reservations
       SET state = 'committed', outcome = 'late_commit:already_charged', settled_at = now()
     WHERE id = p_reservation_id;
    RETURN jsonb_build_object('status', 'committed', 'charged', true, 'replay', false);
  END IF;

  IF v_res.cycle IS DISTINCT FROM v_state.cycle THEN
    UPDATE public.analytics_quota_reservations
       SET state = 'committed', forgiven = false, outcome = 'prior_cycle', settled_at = now()
     WHERE id = p_reservation_id;
    RETURN jsonb_build_object('status', 'committed', 'charged', false, 'outcome', 'prior_cycle');
  END IF;

  IF v_state.quota_limit IS NOT NULL AND v_state.usage_count + 1 > v_state.quota_limit THEN
    UPDATE public.analytics_quota_reservations
       SET state = 'committed', forgiven = false, outcome = 'over_limit_waived', settled_at = now()
     WHERE id = p_reservation_id;
    RETURN jsonb_build_object('status', 'committed', 'charged', false, 'outcome', 'over_limit_waived');
  END IF;

  UPDATE public.profiles SET usage_count = COALESCE(usage_count, 0) + 1, usage_month = v_state.cycle
   WHERE id = p_user_id;
  UPDATE public.analytics_quota_reservations
     SET state = 'committed', charged = true, forgiven = false,
         outcome = CASE WHEN v_res.state = 'uncertain' THEN 'late_commit' ELSE NULL END,
         settled_at = now()
   WHERE id = p_reservation_id;
  RETURN jsonb_build_object('status', 'committed', 'charged', true, 'replay', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_analytics_quota(
  p_user_id uuid,
  p_reservation_id uuid,
  p_outcome text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_state record;
  v_res record;
  v_settled text;
BEGIN
  IF p_user_id IS NULL OR p_reservation_id IS NULL
     OR p_outcome IS NULL OR p_outcome NOT IN ('pre_gemini', 'provider_error', 'uncertain') THEN
    RAISE EXCEPTION 'invalid quota release arguments' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_state FROM public.analytics_quota_lock_state(p_user_id);
  IF NOT v_state.profile_found THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT r.* INTO v_res FROM public.analytics_quota_reservations AS r
   WHERE r.id = p_reservation_id AND r.user_id = p_user_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- Terminal or already-uncertain rows are never refunded (no refund after an
  -- uncertain outcome, no double refund).
  IF v_res.state <> 'reserved' THEN
    RETURN jsonb_build_object('status', v_res.state, 'replay', true);
  END IF;

  IF p_outcome IN ('pre_gemini', 'provider_error') THEN
    UPDATE public.analytics_quota_reservations
       SET state = 'refunded', outcome = p_outcome, settled_at = now()
     WHERE id = p_reservation_id;
    RETURN jsonb_build_object('status', 'refunded', 'replay', false);
  END IF;

  v_settled := public.analytics_quota_mark_uncertain(
    p_reservation_id, 'uncertain', v_state.usage_count, v_state.quota_limit, v_state.cycle);
  RETURN jsonb_build_object('status', 'uncertain', 'settlement', v_settled, 'replay', false);
END;
$$;

-- ── Grants: service_role only (Supabase default privileges grant EXECUTE to
-- PUBLIC/anon/authenticated on new functions, so revoke explicitly).
REVOKE ALL ON FUNCTION public.analytics_quota_forgiven_per_cycle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_quota_lock_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_quota_mark_uncertain(uuid, text, integer, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_quota_expire(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_analytics_quota(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_analytics_quota(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_analytics_quota(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_analytics_quota(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_analytics_quota(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_analytics_quota(uuid, uuid, text) TO service_role;
