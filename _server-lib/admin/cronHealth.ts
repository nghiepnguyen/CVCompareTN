import type { SupabaseClient } from '@supabase/supabase-js';

// P1-D cron health check (GET /api/admin/cron-health, bearer CRON_HEALTH_SECRET).
// Calls public.cron_job_health(text[]) — supabase/proposed/p1d-ops-guardrails/,
// not applied until approved. Responds with enums, ages and counts only: never
// cron return_message or command text, so an alert cannot carry row data.

const JOB_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const MAX_JOBS = 20;
const STATES = new Set(['ok', 'missing', 'inactive', 'stale', 'failing']);

export type CronJobHealth = {
  job: string;
  state: 'ok' | 'missing' | 'inactive' | 'stale' | 'failing' | 'unknown';
  hours_since_success: number | null;
  consecutive_failures: number;
  runs_7d: number;
};

type Result = { status: number; body: Record<string, unknown> };

export function parseJobList(raw: unknown): string[] | null {
  if (typeof raw !== 'string') return null;
  const jobs = [...new Set(raw.split(',').map((j) => j.trim()).filter(Boolean))];
  if (jobs.length === 0 || jobs.length > MAX_JOBS || !jobs.every((j) => JOB_NAME.test(j))) return null;
  return jobs;
}

function toInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) ? n : null;
}

export async function handleCronHealth(rawJobs: unknown, supabase: SupabaseClient): Promise<Result> {
  const jobs = parseJobList(rawJobs);
  if (!jobs) return { status: 400, body: { error: 'invalid_jobs' } };

  const { data, error } = await supabase.rpc('cron_job_health', { p_jobs: jobs });
  if (error) {
    const missing = error.code === 'PGRST202' || error.code === '42883';
    return { status: 503, body: { healthy: false, error: missing ? 'health_function_missing' : 'health_query_failed' } };
  }

  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const byJob = new Map(rows.map((r) => [String(r.job), r]));
  const result: CronJobHealth[] = jobs.map((job) => {
    const r = byJob.get(job);
    if (!r) return { job, state: 'unknown', hours_since_success: null, consecutive_failures: 0, runs_7d: 0 };
    const state = typeof r.state === 'string' && STATES.has(r.state) ? (r.state as CronJobHealth['state']) : 'unknown';
    return {
      job,
      state,
      hours_since_success: toInt(r.hours_since_success),
      consecutive_failures: toInt(r.consecutive_failures) ?? 0,
      runs_7d: toInt(r.runs_7d) ?? 0,
    };
  });
  const healthy = result.every((r) => r.state === 'ok');
  return { status: healthy ? 200 : 503, body: { healthy, jobs: result } };
}
