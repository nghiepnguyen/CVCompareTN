// Server-side size ceilings for the analyze / parse-cv / Full CV rewrite
// inputs (M2-B). Oversize input is REJECTED (413), never truncated, so the
// canonical request for every accepted input is byte-for-byte unchanged.
//
// These are generous safety ceilings, not production percentiles: no
// production JD/CV length data was available when they were set. Local
// benchmark JDs (scripts/benchmark-gemini-fixtures.ts) top out under 1k chars;
// the in-repo CV precedent is MAX_COVER_LETTER_CV_CHARS = 30k. Tighten only
// after checking real analyze input sizes (analysis_log.input_tokens).
export const MAX_JD_CHARS = 50_000;
export const MAX_CV_TEXT_CHARS = 100_000;

export type InputTooLarge = { status: 413; body: { error: string; field: 'jd' | 'cv'; maxChars: number } };

/** Binary CVs (PDF / image base64) are bounded by the body/storage limits instead. */
export function isTextCv(mimeType: string): boolean {
  return mimeType !== 'application/pdf' && !mimeType.startsWith('image/');
}

export function checkInputSize(input: { jd?: string; cvData?: string; cvMimeType: string }): InputTooLarge | null {
  if (input.jd && input.jd.length > MAX_JD_CHARS) {
    return { status: 413, body: { error: 'Job description too large', field: 'jd', maxChars: MAX_JD_CHARS } };
  }
  if (input.cvData && isTextCv(input.cvMimeType) && input.cvData.length > MAX_CV_TEXT_CHARS) {
    return { status: 413, body: { error: 'CV too large', field: 'cv', maxChars: MAX_CV_TEXT_CHARS } };
  }
  return null;
}
