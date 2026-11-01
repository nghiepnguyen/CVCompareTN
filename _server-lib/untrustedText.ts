// P0 trust boundary for user-supplied text (JD/CV) before it reaches Gemini.
// Risk reduction only, not a sandbox: inline PDF/image input is never seen by
// this code, and visible instruction-like text is left to the prompt rules.

// Invisible characters used to hide instructions or split tokens past the
// raw-JD guard: zero-width (200B–200D, 2060, FEFF), bidi controls (061C,
// 200E, 200F, 202A–202E, 2066–2069) and Unicode tags (E0000–E007F). An
// explicit list — no NFC/NFKC or combining-mark stripping — so Vietnamese
// text (precomposed or decomposed) is returned byte-identical.
const INVISIBLE_CONTROLS = /[​-‏‪-‮⁠⁦-⁩﻿؜]|[\u{E0000}-\u{E007F}]/gu;

export function stripInvisibleControls(text: string): string {
  return text.replace(INVISIBLE_CONTROLS, '');
}

/**
 * Fence untrusted content between markers the prompts reference. Copies of the
 * markers inside the content are removed so it cannot close its own fence.
 */
export function fenceUntrusted(tag: 'job_description' | 'cv', text: string): string {
  const marker = new RegExp(`</?\\s*${tag}\\s*>`, 'gi');
  return `<${tag}>\n${text.replace(marker, '')}\n</${tag}>`;
}
