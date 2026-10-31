-- Server-side idempotency for admin plan/limit edits. The UI keeps one request
-- id per open modal, so a retry after a network timeout cannot stack the plan
-- twice. The marker is inserted in the same transaction as the mutation; any
-- failure rolls it back and the same id can be retried.
CREATE TABLE IF NOT EXISTS public.admin_action_requests (
  request_id uuid PRIMARY KEY,
  admin_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_action_requests_created_idx
  ON public.admin_action_requests (created_at DESC);

ALTER TABLE public.admin_action_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_action_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_user_v2(
  p_admin_id uuid,
  p_user_id uuid,
  p_plan text DEFAULT NULL,
  p_duration_days integer DEFAULT 30,
  p_limit_mode text DEFAULT 'keep',
  p_limit integer DEFAULT NULL,
  p_request_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'request id required' USING ERRCODE = '22023';
  END IF;

  SELECT admin_id INTO v_owner
  FROM public.admin_action_requests
  WHERE request_id = p_request_id;

  IF v_owner IS NOT NULL THEN
    IF v_owner <> p_admin_id THEN
      RAISE EXCEPTION 'request id belongs to another admin' USING ERRCODE = '42501';
    END IF;
    -- Same admin + same id: the previous attempt committed.
    RETURN;
  END IF;

  INSERT INTO public.admin_action_requests(request_id, admin_id, action)
  VALUES (p_request_id, p_admin_id, 'update_user');

  PERFORM public.admin_update_user(
    p_admin_id,
    p_user_id,
    p_plan,
    p_duration_days,
    p_limit_mode,
    p_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_user_v2(uuid, uuid, text, integer, text, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_v2(uuid, uuid, text, integer, text, integer, uuid)
  TO service_role;

COMMENT ON FUNCTION public.admin_update_user_v2(uuid, uuid, text, integer, text, integer, uuid) IS
  'Idempotent admin plan/limit update: one request id applies at most once; marker + mutation share a transaction.';
