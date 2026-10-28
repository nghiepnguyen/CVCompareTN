/**
 * Benchmark parse_cv + rewrite_cv across Gemini models using the REAL
 * production service code (prompts, schemas, PDF handling, normalization).
 * The model/thinking config is swapped only inside this process by wrapping
 * Models.prototype.generateContent — production code is untouched.
 *
 * Usage:
 *   node --env-file=.env --env-file=.env.local node_modules/.bin/tsx \
 *     scripts/benchmark-gemini-parse-rewrite.ts <outDir>
 * Env: RUNS (default 2), CONCURRENCY (default 3), ONLY (comma-separated sample ids),
 *      MODE=production (no override: each workload runs on its routed model,
 *      as in production; the model actually sent is recorded per call),
 *      WORKLOAD (parse_cv | rewrite_cv; default both).
 * rewrite_cv rows record the Full CV fidelity guard (Stage 3.3): Gemini calls
 * per request (max 2), first-pass violations, fidelity fallback, and the final
 * output re-validated (must be clean unless validation was skipped).
 * PDF samples read .r2-migration/preview/fixtures (gitignored); they are
 * skipped with a warning when those files are absent.
 *
 * Writes metrics.jsonl + raw outputs to <outDir> (keep it outside the repo).
 * Console prints metrics only, never CV/JD text.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { Models } from '@google/genai';
import { extractText } from 'unpdf';
import { generateParsedCV } from '../_server-lib/ai/parseCvService.js';
import { generateFullRewrite, parseRewriteText } from '../_server-lib/ai/rewriteService.js';
import { validateFullRewrite } from '../_server-lib/ai/suggestionGuard.js';
import { thinkingConfigFor } from '../_server-lib/ai/geminiClient.js';
import { GEMINI_PRICING, isGeminiModel, type GeminiModel } from '../src/lib/geminiModels.js';
import { SAMPLES, type Sample } from './benchmark-gemini-fixtures.js';

// id null = production routing (no override).
type ModelCfg = { id: GeminiModel | null; label: string };
const MODELS: ModelCfg[] =
  process.env.MODE === 'production'
    ? [{ id: null, label: 'prod' }]
    : [
        { id: 'gemini-3-flash-preview', label: 'preview' },
        { id: 'gemini-3.5-flash-lite', label: 'lite-low' },
      ];

// Token/latency figures are summed over every Gemini call of the request
// (rewrite_cv makes up to 2); `text` is the last response, `firstText` the first.
type Capture = {
  text?: string; firstText?: string; calls: number; inTok: number; outTok: number; thoughts?: number; totalTok: number;
  geminiMs: number; model?: string; thinkingConfig?: unknown;
};
const ctx = new AsyncLocalStorage<{ model: ModelCfg; capture: Capture }>();

// The SDK assigns generateContent per instance in the Models constructor
// (`this.generateContent = async ...`), so intercept that assignment with a
// prototype setter and wrap the instance function.
type GenerateContent = Models['generateContent'];
Object.defineProperty(Models.prototype, 'generateContent', {
  configurable: true,
  set(this: Models, original: GenerateContent) {
    const wrapped: GenerateContent = async (params) => {
      const store = ctx.getStore();
      if (!store) throw new Error('benchmark: generateContent called outside a benchmark context');
      const t = Date.now();
      const id = store.model.id;
      const sent = id
        ? { ...params, model: id, config: { ...params.config, thinkingConfig: thinkingConfigFor(id) } }
        : params;
      store.capture.model = sent.model;
      store.capture.thinkingConfig = sent.config?.thinkingConfig;
      const res = await original(sent);
      const c = store.capture;
      const u = res.usageMetadata;
      c.calls++;
      c.geminiMs += Date.now() - t;
      if (c.calls === 1) c.firstText = res.text;
      c.text = res.text;
      c.inTok += u?.promptTokenCount ?? 0;
      c.outTok += u?.candidatesTokenCount ?? 0;
      c.totalTok += u?.totalTokenCount ?? 0;
      if (u?.thoughtsTokenCount !== undefined) c.thoughts = (c.thoughts ?? 0) + u.thoughtsTokenCount;
      return res;
    };
    Object.defineProperty(this, 'generateContent', { value: wrapped, writable: true, configurable: true });
  },
});

const outDir = process.argv[2];
if (!outDir) throw new Error('usage: benchmark-gemini-parse-rewrite.ts <outDir>');
mkdirSync(join(outDir, 'raw'), { recursive: true });
const RUNS = Number(process.env.RUNS || 2);
const CONCURRENCY = Number(process.env.CONCURRENCY || 3);

const norm = (s: string) => s.toLowerCase().normalize('NFC');
const digits = (s: string) => s.replace(/[^\d]/g, '');
const has = (hay: string, needle: string) => norm(hay).includes(norm(needle));

async function loadCv(s: Sample): Promise<{ cvData: string; mimeType: string; sourceText: string }> {
  if (s.text) return { cvData: s.text, mimeType: 'text/plain', sourceText: s.text };
  const buf = readFileSync(s.file!.path);
  const { text } = await extractText(new Uint8Array(buf), { mergePages: true });
  return { cvData: buf.toString('base64'), mimeType: s.file!.mimeType, sourceText: text };
}

function scoreParse(raw: string | undefined, s: Sample) {
  let j: any;
  try { j = JSON.parse(raw || ''); } catch (e) { return { schemaOk: false, parseError: String(e).slice(0, 120) }; }
  const req = ['personal_information', 'education', 'work_experience', 'skills', 'projects', 'certifications', 'ats_evaluation'];
  const missingKeys = req.filter((k) => !(k in j));
  const pi = j.personal_information || {};
  const work: any[] = j.work_experience || [];
  const edu: any[] = j.education || [];
  const t = s.truth;
  const blob = JSON.stringify(j);
  const skillBlob = JSON.stringify(j.skills || {});
  const found = (list: string[], hay: string) => list.filter((x) => has(hay, x)).length;
  const workBlob = JSON.stringify(work.map((w) => [w.company, w.job_title]));
  const startYears = work.map((w) => Number(String(w.duration?.start || '').match(/\d{4}/)?.[0]));
  return {
    schemaOk: missingKeys.length === 0 && !!pi.full_name,
    missingKeys,
    nameOk: t.name ? has(pi.full_name || '', t.name) : null,
    emailOk: t.email ? norm(pi.contact?.email || '') === norm(t.email) : null,
    phoneOk: t.phone ? digits(pi.contact?.phone || '').endsWith(digits(t.phone).slice(-9)) : null,
    jobs: work.length,
    jobsExpected: t.companies.length,
    companiesFound: `${found(t.companies, workBlob)}/${t.companies.length}`,
    titlesFound: `${found(t.titles, workBlob)}/${t.titles.length}`,
    startYearsOk: t.startYears.length ? JSON.stringify(startYears) === JSON.stringify(t.startYears) : null,
    startYears,
    eduFound: `${found(t.institutions, JSON.stringify(edu))}/${t.institutions.length}`,
    gradYears: edu.map((e) => e.graduation_year),
    skillsFound: `${found(t.skills, skillBlob)}/${t.skills.length}`,
    certsFound: `${found(t.certifications, JSON.stringify(j.certifications || []))}/${t.certifications.length}`,
    langsFound: `${found(t.languages, JSON.stringify(j.skills?.languages || []))}/${t.languages.length}`,
    // Extra jobs beyond the CV = likely hallucinated entries.
    extraJobs: t.companies.length ? Math.max(0, work.length - t.companies.length) : null,
    yearsOfExperience: j.ats_evaluation?.years_of_experience,
    bytes: blob.length,
  };
}

const VI_CHARS = /[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ]/gi;

function scoreRewrite(md: string, s: Sample, sourceText: string) {
  const lines = md.split('\n');
  const bullets = lines.filter((l) => /^\s*-\s/.test(l));
  const bulletWords = bullets.map((b) => b.split(/\s+/).length);
  const letters = (md.match(/\p{L}/gu) || []).length || 1;
  const viRatio = (md.match(VI_CHARS) || []).length / letters;
  // Numbers (2+ digits or with %) in the rewrite that never appear in the source CV.
  const nums = (x: string) => new Set((x.match(/\d[\d.,]*\d%?|\d+%/g) || []).map((n) => n.replace(/[.,]/g, '')));
  const srcNums = nums(sourceText);
  const newNumbers = sourceText
    ? [...nums(md)].filter((n) => !srcNums.has(n) && !/^(19|20)\d\d$/.test(n) && !/^(0[1-9]|1[0-2])(19|20)\d\d$/.test(n))
    : null;
  const kwCount = (k: string) => (norm(md).match(new RegExp(norm(k).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'g')) || []).length;
  return {
    chars: md.length,
    h1First: /^#\s/.test(lines[0] || ''),
    h2: lines.filter((l) => /^##\s/.test(l)).length,
    h3: lines.filter((l) => /^###\s/.test(l)).length,
    bullets: bullets.length,
    avgBulletWords: bulletWords.length ? Math.round(bulletWords.reduce((a, b) => a + b, 0) / bulletWords.length) : 0,
    maxBulletWords: Math.max(0, ...bulletWords),
    mmYyyy: (md.match(/\b(0[1-9]|1[0-2])\/(19|20)\d\d\b/g) || []).length,
    viRatio: Number(viRatio.toFixed(3)),
    languageOk: s.language === 'vi' ? viRatio > 0.05 : viRatio < 0.01,
    companiesKept: `${s.truth.companies.filter((c) => has(md, c)).length}/${s.truth.companies.length}`,
    nameKept: s.truth.name ? has(md, s.truth.name) : null,
    jdKwCovered: `${s.jdKeywords.filter((k) => kwCount(k) > 0).length}/${s.jdKeywords.length}`,
    // JD keywords absent from the source CV but present in the rewrite: fabrication candidates (read manually).
    jdOnlyKwAdded: sourceText ? s.jdKeywords.filter((k) => !has(sourceText, k) && kwCount(k) > 0) : null,
    maxKwRepeat: Math.max(0, ...s.jdKeywords.map(kwCount)),
    newNumbers,
  };
}

type Job = { sample: Sample; workload: 'parse_cv' | 'rewrite_cv'; model: ModelCfg; run: number };
const jobs: Job[] = [];
const samples = SAMPLES.filter((s) => !process.env.ONLY || process.env.ONLY.split(',').includes(s.id)).filter((s) => {
  if (!s.file || existsSync(s.file.path)) return true;
  console.warn(`skipping ${s.id}: fixture ${s.file.path} not found (local-only, gitignored)`);
  return false;
});
for (let run = 1; run <= RUNS; run++)
  for (const sample of samples)
    for (const workload of ['parse_cv', 'rewrite_cv'] as const)
      if (!process.env.WORKLOAD || process.env.WORKLOAD === workload)
      for (const model of MODELS) jobs.push({ sample, workload, model, run });

const cvCache = new Map<string, Awaited<ReturnType<typeof loadCv>>>();

async function runJob({ sample, workload, model, run }: Job) {
  if (!cvCache.has(sample.id)) cvCache.set(sample.id, await loadCv(sample));
  const cv = cvCache.get(sample.id)!;
  const capture: Capture = { calls: 0, inTok: 0, outTok: 0, totalTok: 0, geminiMs: 0 };
  const t = Date.now();
  let error: string | undefined;
  let output: unknown;
  try {
    output = await ctx.run({ model, capture }, () =>
      workload === 'parse_cv'
        ? generateParsedCV(sample.jd, cv.cvData, cv.mimeType, sample.language)
        : generateFullRewrite(sample.jd, cv.cvData, cv.mimeType, sample.language)
    );
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const ms = Date.now() - t;
  const { inTok, outTok, thoughts } = capture;
  // Google bills thinking tokens as output when the API reports them.
  const modelRan = capture.model ?? model.id ?? 'unknown';
  const price = isGeminiModel(modelRan) ? GEMINI_PRICING[modelRan] : null;
  const costUsd = price ? (inTok * price.inputPer1M + (outTok + Number(thoughts || 0)) * price.outputPer1M) / 1e6 : NaN;
  const quality =
    error ? null
    : workload === 'parse_cv' ? scoreParse(capture.text, sample)
    : scoreRewrite((output as { fullRewrittenCV: string }).fullRewrittenCV, sample, cv.sourceText);
  // Same evidence rule as the service: only text input or a PDF with >=100
  // extracted characters is validated; inline PDF/image is skipped.
  const validated = cv.mimeType === 'text/plain' || (cv.mimeType === 'application/pdf' && cv.sourceText.trim().length >= 100);
  const rw = output as { fullRewrittenCV: string; fidelityFallback?: true } | undefined;
  const fidelity =
    workload !== 'rewrite_cv' || error || !rw ? null
    : {
        validated,
        calls: capture.calls,
        retried: capture.calls > 1,
        fallback: !!rw.fidelityFallback,
        firstPassViolations: validated && capture.firstText
          ? validateFullRewrite({ originalCvText: cv.sourceText, jd: sample.jd, rewrittenCv: parseRewriteText(capture.firstText) }).violations
          : null,
        // Must be [] for every validated, non-fallback row.
        finalViolations: validated && !rw.fidelityFallback
          ? validateFullRewrite({ originalCvText: cv.sourceText, jd: sample.jd, rewrittenCv: rw.fullRewrittenCV }).violations
          : null,
      };
  const row = {
    sample: sample.id, workload, model: modelRan, thinkingConfig: capture.thinkingConfig, run, ms, geminiMs: capture.geminiMs,
    inTok, outTok, totalTok: capture.totalTok, fidelity,
    thinkingTok: thoughts ?? 'not separately reported',
    costUsd: Number(costUsd.toFixed(6)),
    ok: !error, timeout: !!error?.includes('(Timeout)'), error: error?.slice(0, 200), quality,
  };
  appendFileSync(join(outDir, 'metrics.jsonl'), JSON.stringify(row) + '\n');
  const base = join(outDir, 'raw', `${sample.id}.${workload}.${model.label}.r${run}`);
  if (workload === 'rewrite_cv' && output) writeFileSync(base + '.md', (output as { fullRewrittenCV: string }).fullRewrittenCV);
  if (workload === 'rewrite_cv' && capture.calls > 1 && capture.firstText) writeFileSync(base + '.first.md', parseRewriteText(capture.firstText));
  else if (capture.text) writeFileSync(base + '.json', capture.text);
  console.log(JSON.stringify({ sample: row.sample, workload, model: modelRan, thinking: capture.thinkingConfig, run, ms, inTok, outTok, ok: row.ok, calls: capture.calls, fallback: fidelity?.fallback, err: row.error?.slice(0, 80) }));
}

const queue = [...jobs];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let j = queue.shift(); j; j = queue.shift()) await runJob(j);
  })
);
console.log(`done: ${jobs.length} calls → ${outDir}`);
