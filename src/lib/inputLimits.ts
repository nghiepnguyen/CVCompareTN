// Analyze / parse-cv / Full CV input ceilings (M2-B). The server rejects
// oversize input with 413 (_server-lib/inputLimits.ts); the client checks the
// same numbers first so an oversize JD never starts CV parsing (M2-D2 K0).
export const MAX_JD_CHARS = 50_000;
export const MAX_CV_TEXT_CHARS = 100_000;
