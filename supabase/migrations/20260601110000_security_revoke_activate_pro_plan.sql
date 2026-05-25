-- Security: activate_pro_plan must only be callable via service_role (PayOS webhook backend).

REVOKE EXECUTE ON FUNCTION public.activate_pro_plan(
  uuid,
  bigint,
  integer,
  jsonb
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.activate_pro_plan(
  uuid,
  bigint,
  integer,
  jsonb
) FROM authenticated;
