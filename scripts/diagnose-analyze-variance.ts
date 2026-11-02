/**
 * P2A.2 diagnostic: run-to-run variance of the production analyzeCV on ONE
 * fixed synthetic CV/JD (the P2A production smoke fixture), and determinism of
 * the post-model pipeline. Diagnostic only, not imported by runtime code.
 *
 * Intercepts global fetch (script process only) to record each Gemini request
 * body hash and the raw model response; analyzeCV itself is unchanged.
 *
 * Usage:
 *   node --env-file=.env --env-file=.env.local node_modules/.bin/tsx \
 *     scripts/diagnose-analyze-variance.ts <outDir>
 * Env: RUNS (default 20), FIXTURE=smoke|control (default smoke),
 *      UI_LANG=vi|en (default vi, as in the smoke), REPLAY=N (default 20; post-model runs).
 * Writes runs.jsonl, replay.jsonl and raw/*.json to <outDir> (keep it outside the repo).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeCV } from '../_server-lib/ai/analysisService.js';
import { stripInvisibleControls } from '../_server-lib/untrustedText.js';
import type { AnalysisResult } from '../src/services/ai/types.js';
import { SAMPLES } from './benchmark-gemini-fixtures.js';

const outDir = process.argv[2];
if (!outDir) throw new Error('usage: diagnose-analyze-variance.ts <outDir>');
mkdirSync(join(outDir, 'raw'), { recursive: true });
const RUNS = Number(process.env.RUNS || 20);
const REPLAY = Number(process.env.REPLAY || 20);
const LANG: 'vi' | 'en' = process.env.UI_LANG === 'en' ? 'en' : 'vi';

// The exact synthetic CV/JD typed into cvfit.pro during the P2A smoke (no personal data).
const SMOKE_JD = `Senior Frontend Developer - Acme Test Labs

About the role:
Acme Test Labs is hiring a Senior Frontend Developer to build customer-facing web applications.

Requirements:
- 4+ years of experience in frontend development
- Strong React and TypeScript skills
- Experience building reusable UI component libraries
- Experience improving web performance
- Collaboration with product and design teams; Figma is a plus

Nice to have:
- Experience with Next.js
- Testing with Jest

P2A-SMOKE-JD-END-MARKER`;
const SMOKE_CV = `NGUYEN VAN TEST
Frontend Developer

5 years of experience building web applications.

Experience:
Senior Frontend Developer — Demo Company
2021–Present

- Built applications using React and TypeScript.
- Created reusable UI components.
- Improved frontend performance.
- Worked with product and design teams.

Skills:
React, TypeScript, JavaScript, HTML, CSS, Figma`;

const control = SAMPLES.find((s) => s.id === 'en-medium' && s.text);
const fixture = process.env.FIXTURE === 'control'
  ? { id: 'control-en-medium', jd: control!.jd, cv: control!.text! }
  : { id: 'smoke', jd: SMOKE_JD, cv: SMOKE_CV };

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// --- fetch interception (records; replays only in the post-model phase) ---
type Call = { url: string; requestHash: string; analyze: boolean; rawText?: string; modelVersion?: string; responseId?: string };
let calls: Call[] = [];
let replayBody: string | undefined; // when set, analyze requests get this response instead of the network
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (new URL(url).hostname !== 'generativelanguage.googleapis.com') return realFetch(input, init);
  const body = typeof init?.body === 'string' ? init.body : '';
  // The analyze request is the only one carrying the analysis schema (matchScore).
  const analyze = body.includes('"matchScore"');
  const call: Call = { url: url.replace(/key=[^&]+/, 'key=REDACTED'), requestHash: sha(body), analyze };
  calls.push(call);
  if (analyze && replayBody) return new Response(replayBody, { status: 200, headers: { 'content-type': 'application/json' } });
  const res = await realFetch(input, init);
  const text = await res.clone().text();
  if (analyze) {
    try {
      const j = JSON.parse(text);
      call.rawText = (j.candidates?.[0]?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? '').join('');
      call.modelVersion = j.modelVersion;
      call.responseId = j.responseId;
      writeFileSync(join(outDir, 'raw', `${fixture.id}-${Date.now()}.json`), text);
    } catch { /* non-JSON error body: kept out of the summary */ }
  }
  return res;
}) as typeof fetch;

type DC = NonNullable<AnalysisResult['detailedComparison']>;
const rows = (r: AnalysisResult) => {
  const d = r.detailedComparison as DC | undefined;
  return d ? (['skills', 'experience', 'tools', 'education', 'keywords'] as const).flatMap((k) => (d[k] ?? []).map((i) => ({ k, requirement: i.requirement, status: i.status, verification: i.verification, priority: i.priority }))) : [];
};
const summary = (r: AnalysisResult) => {
  const req = rows(r);
  const count = (s: string) => req.filter((x) => x.status === s).length;
  return { matchScore: r.matchScore, categoryScores: r.categoryScores, passProbability: r.passProbability, matched: count('matched'), partial: count('partial'), missing: count('missing'), requirements: req };
};

console.log(JSON.stringify({ fixture: fixture.id, lang: LANG, rawCvSha: sha(fixture.cv), effectiveCvSha: sha(stripInvisibleControls(fixture.cv)), rawJdSha: sha(fixture.jd), normalizedJdSha: sha(stripInvisibleControls(fixture.jd).trim()) }));

// --- phase 1: repeated live analyze, sequential ---
let firstRaw: string | undefined;
for (let run = 1; run <= RUNS; run++) {
  calls = [];
  const t0 = Date.now();
  try {
    // Same JD normalization as _server-lib/analyze/handler.ts; text/plain as the smoke's pasted CV.
    const jd = stripInvisibleControls(fixture.jd).trim();
    const { result, usage } = await analyzeCV(jd, fixture.cv, 'text/plain', 'CV_Pasted.txt', LANG, 120_000);
    const a = calls.filter((c) => c.analyze);
    firstRaw ??= a[0]?.rawText;
    let rawScore: unknown;
    try { rawScore = JSON.parse(a[0]?.rawText ?? '{}').matchScore; } catch { rawScore = 'unparsed'; }
    const line = {
      run, ...summary(result), rawModelMatchScore: rawScore, model: usage.model, modelVersion: a[0]?.modelVersion,
      latencyMs: Date.now() - t0, geminiCalls: calls.length, analyzeCalls: a.length,
      retryOrFallback: a.length !== 1, promptHash: a[0]?.requestHash, inputTokens: usage.inputTokens, presentationLanguage: result.presentationLanguage,
    };
    appendFileSync(join(outDir, 'runs.jsonl'), JSON.stringify(line) + '\n');
    console.log(JSON.stringify({ run, matchScore: line.matchScore, raw: rawScore, cats: line.categoryScores, m: line.matched, p: line.partial, x: line.missing, calls: line.geminiCalls, prompt: line.promptHash?.slice(0, 12) }));
  } catch (e) {
    appendFileSync(join(outDir, 'runs.jsonl'), JSON.stringify({ run, error: e instanceof Error ? e.message : String(e), geminiCalls: calls.length }) + '\n');
    console.log(JSON.stringify({ run, error: e instanceof Error ? e.message.slice(0, 120) : 'error' }));
  }
}

// --- phase 2: post-model determinism (one captured raw response, replayed) ---
if (firstRaw && REPLAY > 0) {
  replayBody = JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: firstRaw }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0 } });
  const seen = new Set<string>();
  for (let i = 1; i <= REPLAY; i++) {
    calls = [];
    // LANG=en: no localization call, so the network is not used at all here.
    const { result } = await analyzeCV(stripInvisibleControls(fixture.jd).trim(), fixture.cv, 'text/plain', 'CV_Pasted.txt', 'en', 120_000);
    const { id: _id, timestamp: _ts, ...rest } = result;
    const h = sha(JSON.stringify(rest));
    seen.add(h);
    appendFileSync(join(outDir, 'replay.jsonl'), JSON.stringify({ i, outputHash: h, ...summary(result) }) + '\n');
  }
  console.log(JSON.stringify({ replay: REPLAY, distinctOutputs: seen.size }));
}
