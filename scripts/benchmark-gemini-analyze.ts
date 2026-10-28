/**
 * Benchmark the analyze workload (production analyzeCV, routed model, real
 * prompt/schema/normalization) on the synthetic fixtures in
 * scripts/benchmark-gemini-fixtures.ts. Meant for prompt before/after runs:
 * run once on the old prompt, once on the new, compare metrics.jsonl.
 *
 * Usage:
 *   node --env-file=.env --env-file=.env.local node_modules/.bin/tsx \
 *     scripts/benchmark-gemini-analyze.ts <outDir>
 * Env: RUNS (default 2), CONCURRENCY (default 3), ONLY (comma-separated sample ids),
 *      RESCORE=1 (no API calls: re-score <outDir>/raw/*.json into metrics-rescored.jsonl).
 *
 * Writes metrics.jsonl + raw JSON results to <outDir> (keep it outside the repo).
 * Console prints metrics only, never CV/JD text.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractText } from 'unpdf';
import { analyzeCV } from '../_server-lib/ai/analysisService.js';
import { GEMINI_PRICING } from '../src/lib/geminiModels.js';
import type { AnalysisResult } from '../src/services/ai/types.js';
import { SAMPLES, type Sample } from './benchmark-gemini-fixtures.js';

const outDir = process.argv[2];
if (!outDir) throw new Error('usage: benchmark-gemini-analyze.ts <outDir>');
mkdirSync(join(outDir, 'raw'), { recursive: true });
const RUNS = Number(process.env.RUNS || 2);
const CONCURRENCY = Number(process.env.CONCURRENCY || 3);

const norm = (s: string) => s.toLowerCase().normalize('NFC');
const has = (hay: string, needle: string) => norm(hay).includes(norm(needle));
const VI_CHARS = /[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ]/gi;
const viRatio = (s: string) => (s.match(VI_CHARS) || []).length / ((s.match(/\p{L}/gu) || []).length || 1);
// Numbers with 2+ digits or a %, stripped of separators; years and MM/YYYY are not metrics.
const nums = (s: string) =>
  new Set((s.replace(/\b\d{1,2}\/(19|20)\d{2}\b/g, ' ').match(/\d[\d.,]*\d%?|\d+%/g) || []).map((n) => n.replace(/[.,]/g, '')).filter((n) => !/^(19|20)\d\d$/.test(n) && !/^(0[1-9]|1[0-2])(19|20)\d\d$/.test(n)));

async function loadCv(s: Sample) {
  if (s.text) return { cvData: s.text, mimeType: 'text/plain', sourceText: s.text };
  const buf = readFileSync(s.file!.path);
  const { text } = await extractText(new Uint8Array(buf), { mergePages: true });
  return { cvData: buf.toString('base64'), mimeType: s.file!.mimeType, sourceText: text };
}

function score(r: AnalysisResult, s: Sample, sourceText: string, uiLang: 'vi' | 'en') {
  const srcNums = nums(sourceText);
  const jdOnly = s.jdOnlySkills ?? [];
  const sugg = r.rewriteSuggestions ?? [];
  const optimized = sugg.map((x) => x.optimized ?? '');
  const fabricatedMetrics = sourceText ? optimized.flatMap((o) => [...nums(o)].filter((n) => !srcNums.has(n))) : null;
  // "N năm/years" in a suggestion where the CV never states N (single digits included).
  const srcAllNums = new Set((sourceText.match(/\d+/g) || []));
  const yearsChanged = sourceText ? optimized.flatMap((o) => [...o.matchAll(/(\d+)\+?\s*(?:năm|years?)/gi)].map((m) => m[1]).filter((n) => !srcAllNums.has(n))) : null;
  const jdOnlyInOptimized = optimized.flatMap((o) => jdOnly.filter((k) => has(o, k)));
  const jdOnlyInAtsKeywords = (r.atsKeywords ?? []).filter((kw) => jdOnly.some((k) => has(kw, k)));
  const jdOnlyInStrengths = (r.matchingPoints ?? []).flatMap((p) => jdOnly.filter((k) => has(p.content, k)).map((k) => `${k}: ${p.content.slice(0, 90)}`));
  const dc = r.detailedComparison;
  const dcItems = dc ? [...dc.skills, ...dc.tools, ...dc.experience, ...dc.education, ...dc.keywords] : [];
  const jdOnlyMarkedMatched = dcItems.filter((i) => i.status === 'matched' && jdOnly.some((k) => has(i.requirement, k))).map((i) => i.requirement);
  const xyzLeak = optimized.filter((o) => /accomplished|as measured by|by doing/i.test(o) && !/accomplished|as measured by|by doing/i.test(sourceText)).length;
  const analysisText = [r.passExplanation, r.mainFactor, ...(r.matchingPoints ?? []).map((p) => p.content), ...(r.missingGaps ?? []).map((g) => g.content)].join(' ');
  // Numbers stated as candidate facts outside the suggestions.
  const factText = [r.passExplanation, r.mainFactor, ...(r.matchingPoints ?? []).map((p) => p.content), ...dcItems.map((i) => i.cvEvidence ?? '')];
  const fabricatedFactNumbers = sourceText ? factText.flatMap((t) => [...nums(t ?? '')].filter((n) => !srcNums.has(n))) : null;
  // "Not shown" worded as inability.
  const gapText = [r.passExplanation, ...(r.missingGaps ?? []).map((g) => g.content)];
  const inabilityWording = gapText.filter((t) => /thiếu khả năng|không có khả năng|không thể|\blacks?\b|\bcannot\b|\bunable\b/i.test(t ?? '')).length;
  // Each JD-only skill should surface as a gap (missingGaps, or detailedComparison missing/partial).
  const gapBlob = [...(r.missingGaps ?? []).map((g) => g.content), ...dcItems.filter((i) => i.status !== 'matched').map((i) => i.requirement)].join(' ');
  const jdOnlyFlaggedAsGap = jdOnly.length ? `${jdOnly.filter((k) => has(gapBlob, k)).length}/${jdOnly.length}` : null;
  // Advice to add a JD-only skill must be conditional ("If you…" / "Nếu…").
  const advice = [...dcItems.map((i) => i.improvement ?? ''), ...sugg.map((x) => x.explanation ?? '')];
  const unconditionalAddAdvice = advice.filter((t) => jdOnly.some((k) => has(t, k)) && /\b(add|include|thêm|bổ sung)\b/i.test(t) && !/\bif\b|nếu/i.test(t)).length;
  // JD-only concepts that are not skills/tools (responsibilities, metric concepts…).
  const concepts = s.jdOnlyConcepts ?? [];
  const jdOnlyConceptInOptimized = optimized.flatMap((o) => concepts.filter((k) => has(o, k)));
  const jdOnlyConceptInEvidence = [...(r.matchingPoints ?? []).map((p) => p.content), ...dcItems.filter((i) => i.status === 'matched').map((i) => i.cvEvidence ?? ''), ...(r.atsKeywords ?? [])]
    .flatMap((t) => concepts.filter((k) => has(t, k)));
  const insertVerb = /\b(add|include|insert|incorporate|mention|state|use|thêm|bổ sung|đưa|ghi|lồng ghép|sử dụng)\b/i;
  const unconditionalConceptAdvice = advice.filter((t) => concepts.some((k) => has(t, k)) && insertVerb.test(t) && !/\bif\b|nếu/i.test(t)).length;
  return {
    matchScore: r.matchScore,
    categoryScores: r.categoryScores,
    suggestions: sugg.length,
    matchingPoints: r.matchingPoints?.length ?? 0,
    missingGaps: r.missingGaps?.length ?? 0,
    fabricatedMetrics,
    yearsChanged,
    jdOnlyInOptimized,
    jdOnlyInAtsKeywords,
    jdOnlyInStrengths,
    jdOnlyMarkedMatched,
    xyzLeak,
    fabricatedFactNumbers,
    inabilityWording,
    jdOnlyFlaggedAsGap,
    unconditionalAddAdvice,
    jdOnlyConceptInOptimized,
    jdOnlyConceptInEvidence,
    unconditionalConceptAdvice,
    analysisLangOk: uiLang === 'vi' ? viRatio(analysisText) > 0.05 : viRatio(analysisText) < 0.01,
    optimizedLangOk: optimized.length ? (s.language === 'vi' ? viRatio(optimized.join(' ')) > 0.05 : viRatio(optimized.join(' ')) < 0.01) : null,
  };
}

type Job = { sample: Sample; uiLang: 'vi' | 'en'; run: number };
const samples = SAMPLES.filter((s) => !process.env.ONLY || process.env.ONLY.split(',').includes(s.id)).filter((s) => {
  if (!s.file || existsSync(s.file.path)) return true;
  console.warn(`skipping ${s.id}: fixture ${s.file.path} not found (local-only, gitignored)`);
  return false;
});
const jobs: Job[] = [];
for (let run = 1; run <= RUNS; run++)
  for (const sample of samples) {
    jobs.push({ sample, uiLang: sample.language, run });
    // English CV analyzed from the Vietnamese UI: analysis must be Vietnamese, suggestions stay English.
    if (sample.id === 'en-medium' || sample.id === 'en-jd-concept') jobs.push({ sample, uiLang: 'vi', run });
  }

const cvCache = new Map<string, Awaited<ReturnType<typeof loadCv>>>();
async function runJob({ sample, uiLang, run }: Job) {
  if (!cvCache.has(sample.id)) cvCache.set(sample.id, await loadCv(sample));
  const cv = cvCache.get(sample.id)!;
  const t = Date.now();
  let row: Record<string, unknown>;
  try {
    const { result, usage } = await analyzeCV(sample.jd, cv.cvData, cv.mimeType, sample.id, uiLang);
    const price = GEMINI_PRICING[usage.model];
    row = {
      ok: true, model: usage.model, latencyMs: usage.latencyMs, ms: Date.now() - t,
      inTok: usage.inputTokens, outTok: usage.outputTokens,
      costUsd: Number(((usage.inputTokens * price.inputPer1M + usage.outputTokens * price.outputPer1M) / 1e6).toFixed(6)),
      quality: score(result, sample, cv.sourceText, uiLang),
    };
    writeFileSync(join(outDir, 'raw', `${sample.id}.${uiLang}.r${run}.json`), JSON.stringify(result, null, 2));
  } catch (e) {
    row = { ok: false, ms: Date.now() - t, error: String(e instanceof Error ? e.message : e).slice(0, 200) };
  }
  const full = { sample: sample.id, uiLang, run, ...row };
  appendFileSync(join(outDir, 'metrics.jsonl'), JSON.stringify(full) + '\n');
  console.log(JSON.stringify({ sample: sample.id, uiLang, run, ok: row.ok, ms: row.ms, score: (row.quality as { matchScore?: number })?.matchScore, err: row.error }));
}

if (process.env.RESCORE) {
  const { readdirSync } = await import('node:fs');
  writeFileSync(join(outDir, 'metrics-rescored.jsonl'), '');
  for (const f of readdirSync(join(outDir, 'raw')).filter((f) => f.endsWith('.json'))) {
    const [id, uiLang, run] = f.replace(/\.json$/, '').split('.');
    const sample = SAMPLES.find((s) => s.id === id)!;
    if (!cvCache.has(id)) cvCache.set(id, await loadCv(sample));
    const result = JSON.parse(readFileSync(join(outDir, 'raw', f), 'utf8')) as AnalysisResult;
    const quality = score(result, sample, cvCache.get(id)!.sourceText, uiLang as 'vi' | 'en');
    appendFileSync(join(outDir, 'metrics-rescored.jsonl'), JSON.stringify({ sample: id, uiLang, run: Number(run.slice(1)), quality }) + '\n');
  }
  console.log(`rescored → ${join(outDir, 'metrics-rescored.jsonl')}`);
  process.exit(0);
}

const queue = [...jobs];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let j = queue.shift(); j; j = queue.shift()) await runJob(j);
  })
);
console.log(`done: ${jobs.length} calls → ${outDir}`);
