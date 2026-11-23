// Shared raw provider responses for the A2.2 parity tests (synthetic).
const body = (matchScore: unknown) => JSON.stringify({
  jobTitle: 'Synthetic role',
  ...(matchScore === '<absent>' ? {} : { matchScore }),
  detailedComparison: { skills: [{ requirement: 'SQL', status: 'matched', cvEvidence: 'SQL reports', priority: 'required' }], experience: [], tools: [], education: [], keywords: [] },
});
const cand = (text: string | undefined, finishReason: string | undefined = 'STOP') => ({
  candidates: [{ content: { role: 'model', parts: text === undefined ? [] : [{ text }] }, ...(finishReason ? { finishReason } : {}) }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
  modelVersion: 'gemini-3-flash-preview',
});

export const PARITY_CASES: [string, unknown][] = [
  ['valid integer', cand(body(70))],
  ['valid 82.5 → 83', cand(body(82.5))],
  ['valid 59.5 → 60 (band boundary)', cand(body(59.5))],
  ['valid 79.5 → 80 (band boundary)', cand(body(79.5))],
  ['valid 0', cand(body(0))],
  ['valid 100', cand(body(100))],
  ['above range 100.4', cand(body(100.4))],
  ['out of range 150', cand(body(150))],
  ['out of range -5', cand(body(-5))],
  ['numeric string "77"', cand(body('77'))],
  ['string "abc"', cand(body('abc'))],
  ['null score', cand(body(null))],
  ['missing score', cand(body('<absent>'))],
  ['MAX_TOKENS with valid JSON', cand(body(70), 'MAX_TOKENS')],
  ['MAX_TOKENS with truncated JSON', cand(body(70).slice(0, 40), 'MAX_TOKENS')],
  ['SAFETY', cand(undefined, 'SAFETY')],
  ['RECITATION', cand(body(70), 'RECITATION')],
  ['OTHER', cand(body(70), 'OTHER')],
  ['absent finishReason', cand(body(70), '')],
  ['prompt blocked', { promptFeedback: { blockReason: 'SAFETY' }, usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 } }],
  ['truncated JSON with STOP', cand(body(70).slice(0, 40))],
  ['empty text with STOP', cand('')],
  ['no parts with STOP', cand(undefined)],
  ['no candidates (HTTP 200, empty payload)', { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 } }],
  ['JSON array', cand('[1,2]')],
  ['JSON scalar', cand('42')],
  ['fenced JSON (fallback parser)', cand('```json\n' + body(66) + '\n```')],
  ['trailing comma (fallback parser)', cand('{"matchScore": 71, "jobTitle": "x",}')],
  ['text around JSON', cand('Here you go: ' + body(64))],
];

