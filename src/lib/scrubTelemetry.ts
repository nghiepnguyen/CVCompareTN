const SCRUB_KEYS = new Set([
  'cvdata', 'cvtext', 'jd', 'base64data', 'cvpdfinlinedata', 'parsedcv', 'parsed_cv',
  'full_rewritten_cv', 'email', 'password', 'feedback', 'authorization', 'cookie',
  'set-cookie', 'access_token', 'refresh_token',
]);

// Sentry payloads may contain arrays, serialized bodies, and circular context.
export function scrubTelemetry<T>(data: T): T {
  const ancestors = new WeakSet<object>();
  function scrub(value: unknown): unknown {
    if (typeof value === 'string') {
      try {
        const parsed: unknown = JSON.parse(value);
        if (parsed && typeof parsed === 'object') return JSON.stringify(scrub(parsed));
      } catch { /* Ordinary diagnostic strings are preserved. */ }
      return value;
    }
    if (!value || typeof value !== 'object') return value;
    if (ancestors.has(value)) return '[Circular]';
    ancestors.add(value);
    const result = Array.isArray(value)
      ? value.map(scrub)
      : Object.fromEntries(Object.entries(value).map(([key, child]) => [
        key, SCRUB_KEYS.has(key.toLowerCase()) ? '[Scrubbed]' : scrub(child),
      ]));
    ancestors.delete(value);
    return result;
  }
  return scrub(data) as T;
}
