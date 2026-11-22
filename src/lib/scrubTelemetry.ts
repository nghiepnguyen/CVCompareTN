const SCRUB_KEYS = new Set([
  'cvdata', 'cvtext', 'jd', 'base64data', 'cvpdfinlinedata', 'parsedcv', 'parsed_cv',
  'full_rewritten_cv', 'email', 'password', 'feedback', 'authorization', 'cookie',
  'set-cookie', 'access_token', 'refresh_token',
  // SEC-2: request/span metadata that carries user identifiers or raw input.
  'cookies', 'query_string', 'http.query', 'url.query', 'http.fragment', 'url.fragment',
  'http.client_ip', 'client.address', 'client.ip', 'net.peer.ip', 'net.sock.peer.addr', 'net.host.ip', 'ip_address',
  'phone', 'details',
]);

// Identifiers that must reach Sentry byte-for-byte (a SHA can contain a phone-shaped run).
const ID_KEYS = new Set(['event_id', 'trace_id', 'span_id', 'parent_span_id', 'segment_id', 'release', 'dist', 'id', 'sid']);
const ID_SHAPED = /^(?:[0-9a-f]{16,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const REQUEST_HEADER_ALLOW = ['user-agent', 'content-type', 'content-length', 'accept-language'];

/** SDK-side collection switches, shared by both runtimes; every field is explicit because
 *  a non-null `dataCollection` starts from permissive defaults (userInfo, genAI, frame variables). */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  queryParams: false,
  httpBodies: [],
  httpHeaders: { request: { allow: REQUEST_HEADER_ALLOW }, response: { allow: ['content-type', 'content-length'] } },
  genAI: { inputs: false, outputs: false },
  stackFrameVariables: false,
};

// Order matters: credentials and URLs first, so their contents never reach the later patterns.
const TEXT_RULES: [RegExp, string][] = [
  [/(\b[a-z][\w+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[credentials]@'],
  [/\b(Bearer|Basic)\s+[\w~+/.=-]+/gi, '$1 [token]'],
  [/\b(password|passwd|pwd|token|access_token|refresh_token|id_token|secret|client_secret|api[_-]?key|apikey)(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s&,;"']+)/gi, '$1$2[redacted]'],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[jwt]'],
  [/(\b(?:https?|wss?):\/\/[^\s?#"'<>]*|(?<![\w/])\/[\w\-./~%]*)[?#][^\s"'<>)]*/gi, '$1?[redacted]'],
  // V8 quotes the input it failed on: `Unexpected token 'N', "Nguyen Van"... is not valid JSON`.
  [/"(?:[^"\\]|\\.)*"(?:\.\.\.)? is not valid JSON/g, '"[redacted]" is not valid JSON'],
  [/\{[^{}]*"[^"]*"\s*:[\s\S]*\}/g, '[json]'],
  [/(?<![\w.+-])[\w.+-]+(?:@|%40)[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/gi, '[email]'],
  [/(?<![\w-])(?:\+?84|0)(?:[\s.-]?\d){9,10}(?![\w-])/g, '[phone]'],
];

// Caps regex work (some rules backtrack on long runs) and how much free text leaves the app.
const MAX_TEXT = 4096;

export function redactText(text: string): string {
  const capped = text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…[truncated]` : text;
  return TEXT_RULES.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), capped);
}

// Sentry payloads may contain arrays, serialized bodies, and circular context.
export function scrubTelemetry<T>(data: T): T {
  const ancestors = new WeakSet<object>();
  function scrub(value: unknown, key?: string): unknown {
    if (typeof value === 'string') {
      if ((key && ID_KEYS.has(key)) || ID_SHAPED.test(value)) return value;
      try {
        const parsed: unknown = JSON.parse(value);
        if (parsed && typeof parsed === 'object') return JSON.stringify(scrub(parsed));
      } catch { /* Not JSON: redact as free text. */ }
      return redactText(value);
    }
    if (!value || typeof value !== 'object') return value;
    if (ancestors.has(value)) return '[Circular]';
    ancestors.add(value);
    const result = Array.isArray(value)
      ? value.map((child) => scrub(child))
      : Object.fromEntries(Object.entries(value).map(([childKey, child]) => [
        childKey, SCRUB_KEYS.has(childKey.toLowerCase()) ? '[Scrubbed]' : scrub(child, childKey),
      ]));
    ancestors.delete(value);
    return result;
  }
  return scrub(data) as T;
}

type RequestLike = { method?: unknown; url?: unknown; headers?: Record<string, unknown> };
type EventLike = { request?: RequestLike; user?: { id?: unknown } };

/** Error/transaction events: allowlist request and user, then scrub everything else. */
export function scrubEvent<T>(event: T): T {
  const { request, user, ...rest } = event as EventLike & Record<string, unknown>;
  const safe: Record<string, unknown> = rest;
  if (request) {
    const headers = Object.fromEntries(Object.entries(request.headers ?? {}).filter(([k]) => REQUEST_HEADER_ALLOW.includes(k.toLowerCase())));
    safe.request = { method: request.method, url: request.url, headers };
  }
  if (user?.id !== undefined) safe.user = { id: user.id };
  return scrubTelemetry(safe) as T;
}

type BreadcrumbLike = { category?: string; message?: string; data?: Record<string, unknown> };

/** Console breadcrumbs keep the leading string, Error name/message and short `code`s; other arguments are dropped. */
export function scrubBreadcrumb<T extends BreadcrumbLike>(breadcrumb: T, hint?: { input?: unknown }): T {
  if (breadcrumb.category !== 'console') return scrubTelemetry(breadcrumb);
  const args = Array.isArray(hint?.input) ? hint.input : [breadcrumb.message];
  const parts = args.flatMap((arg, i): string[] => {
    if (typeof arg === 'string') return i === 0 ? [arg] : [];
    if (arg instanceof Error) return [`${arg.name}: ${arg.message}`];
    const code = (arg as { code?: unknown } | null)?.code;
    return typeof code === 'string' && code.length <= 32 ? [`[code=${code}]`] : [];
  });
  const data = { ...breadcrumb.data };
  delete data.arguments;
  return scrubTelemetry({ ...breadcrumb, message: parts.join(' '), data }) as T;
}
