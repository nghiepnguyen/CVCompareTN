-- PROPOSED, OPTIONAL (P1-B + rollup; apply AFTER 01, which creates the
-- settings + analysis_log_retention_cutoffs()) — adopt only if trends beyond
-- the 400-day row retention are wanted. Replaces the 01 function so each expiring row is counted into a
-- user-free daily aggregate in the SAME statement that deletes it (each row is
-- aggregated exactly once; atomic). No user_id, no timestamps finer than a day.
-- Caveat: at low traffic a day/kind/status cell can hold 1–2 rows; the cells
-- still carry no identifier, but publish/report them only in aggregate.
CREATE TABLE IF NOT EXISTS public.analysis_log_daily (
  day           date    NOT NULL,          -- Asia/Ho_Chi_Minh calendar day
  kind          text    NOT NULL,
  status        text    NOT NULL,
  rows          integer NOT NULL,
  input_tokens  bigint  NOT NULL,
  output_tokens bigint  NOT NULL,
  PRIMARY KEY (day, kind, status)
);
ALTER TABLE public.analysis_log_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admins_can_read_analysis_log_daily ON public.analysis_log_daily;
CREATE POLICY admins_can_read_analysis_log_daily ON public.analysis_log_daily
  FOR SELECT USING (public.is_admin());
-- Least privilege from day one (Supabase default ACLs grant everything — P0-H).
REVOKE ALL ON public.analysis_log_daily FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.analysis_log_daily TO authenticated;

CREATE OR REPLACE FUNCTION public.purge_expired_analysis_log()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE n integer; c timestamptz;
BEGIN
  SELECT row_cutoff INTO c FROM public.analysis_log_retention_cutoffs();
  WITH del AS (
    DELETE FROM public.analysis_log
     WHERE created_at < c
    RETURNING created_at, kind, status, input_tokens, output_tokens
  ), agg AS (
    INSERT INTO public.analysis_log_daily AS d (day, kind, status, rows, input_tokens, output_tokens)
    SELECT (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, kind, status, count(*),
           coalesce(sum(input_tokens), 0), coalesce(sum(output_tokens), 0)
      FROM del GROUP BY 1, 2, 3
    ON CONFLICT (day, kind, status) DO UPDATE
      SET rows = d.rows + EXCLUDED.rows,
          input_tokens = d.input_tokens + EXCLUDED.input_tokens,
          output_tokens = d.output_tokens + EXCLUDED.output_tokens
    RETURNING 1
  )
  SELECT count(*) INTO n FROM del;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_analysis_log() FROM PUBLIC, anon, authenticated, service_role;
