import type { CandidateCV } from '../../services/recruiterService';

// Mirrors public.candidate_analysis_lease_seconds() (M2-D3). The client value
// is only a UI hint: the claim RPC decides with the server clock.
export const ANALYSIS_LEASE_MS = 10 * 60_000;
// A worker must not dispatch Gemini this close to its lease end: the analyze
// call itself can take 75 s, and a suspended tab may resume late.
export const DISPATCH_MARGIN_MS = 2 * 60_000;

/** Candidates the Analyze button should try to claim. */
export function isRetryableCandidate(c: CandidateCV, now = Date.now()): boolean {
  if (c.status === 'pending' || c.status === 'error') return true;
  if (c.status !== 'analyzing') return false;
  // Legacy rows have no start time; the server asks for confirmation.
  if (!c.analysisStartedAt) return true;
  const started = Date.parse(c.analysisStartedAt);
  return Number.isNaN(started) || now - started >= ANALYSIS_LEASE_MS;
}

/** True while this tab may still send its claimed attempt to Gemini. */
export function leaseAllowsDispatch(claimedAtMs: number, now = Date.now()): boolean {
  return now - claimedAtMs < ANALYSIS_LEASE_MS - DISPATCH_MARGIN_MS;
}
