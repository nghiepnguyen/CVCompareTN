// P0 input hardening for user-supplied text (JD/CV) before it reaches Gemini.
// Risk reduction only, not a sandbox: inline PDF/image input is never seen by
// this code, and visible instruction-like text is not filtered.

// Invisible characters used to hide instructions or split tokens past the
// raw-JD guard: zero-width (200B–200D, 2060, FEFF), bidi controls (061C,
// 200E, 200F, 202A–202E, 2066–2069) and Unicode tags (E0000–E007F). An
// explicit list — no NFC/NFKC or combining-mark stripping — so Vietnamese
// text (precomposed or decomposed) is returned byte-identical.
const INVISIBLE_CONTROLS = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF\u061C]|[\u{E0000}-\u{E007F}]/gu;

export function stripInvisibleControls(text: string): string {
  return text.replace(INVISIBLE_CONTROLS, '');
}
