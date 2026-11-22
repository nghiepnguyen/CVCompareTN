import { describe, expect, it } from 'vitest';
import { redactText, scrubBreadcrumb, scrubEvent, scrubTelemetry } from '../scrubTelemetry';

describe('scrubTelemetry', () => {
  it('redacts sensitive fields inside arrays and nested event data without changing the input', () => {
    const event = {
      request: { data: { batch: [{ cvData: 'private CV', jd: 'private JD', score: 80 }] } },
      extra: { payload: { cvPdfInlineData: 'private PDF', parsed_cv: { name: 'private' } } },
      breadcrumbs: [{ data: { user: { EMAIL: 'private@example.test' } } }],
    };
    expect(scrubTelemetry(event)).toEqual({
      request: { data: { batch: [{ cvData: '[Scrubbed]', jd: '[Scrubbed]', score: 80 }] } },
      extra: { payload: { cvPdfInlineData: '[Scrubbed]', parsed_cv: '[Scrubbed]' } },
      breadcrumbs: [{ data: { user: { EMAIL: '[Scrubbed]' } } }],
    });
    expect(event.request.data.batch[0].cvData).toBe('private CV');
  });

  it('scrubs serialized JSON request bodies and credentials', () => {
    expect(scrubTelemetry({ data: '{"nested":{"cvText":"private"},"count":1}', headers: { Authorization: 'Bearer private', Cookie: 'session=private' } })).toEqual({
      data: '{"nested":{"cvText":"[Scrubbed]"},"count":1}',
      headers: { Authorization: '[Scrubbed]', Cookie: '[Scrubbed]' },
    });
  });

  it('handles cycles and keeps ordinary diagnostic values', () => {
    const value: Record<string, unknown> = { status: 500, retryable: false, detail: null, message: 'Timeout' };
    value.self = value;
    const result = scrubTelemetry(value);
    expect(result.status).toBe(500);
    expect(result.retryable).toBe(false);
    expect(result.detail).toBeNull();
    expect(result.message).toBe('Timeout');
    expect(result.self).toBe('[Circular]');
  });
});

describe('redactText (SEC-2)', () => {
  const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJ1bml0In0', 'c2ln'].join('.');
  it.each([
    ['User a.b+c@example.co.uk not found', 'User [email] not found'],
    ['to=a%40example.com', 'to=[email]'],
    ['call 0912 345 678 or +84912345678 or 028.3823.4567', 'call [phone] or [phone] or [phone]'],
    [`Authorization: Bearer ${jwt}`, 'Authorization: Bearer [token]'],
    [`token ${jwt}`, 'token [jwt]'],
    ['password=hunter2&next=1', 'password=[redacted]&next=1'],
    ['api_key: "k-123"', 'api_key: [redacted]'],
    ['postgres://admin:s3cret@db.internal/app', 'postgres://[credentials]@db.internal/app'],
    ['GET https://cvfit.pro/vi/app?email=a%40b.co#access_token=x failed', 'GET https://cvfit.pro/vi/app?[redacted] failed'],
    ['/rest/v1/profiles?email=eq.a@b.co', '/rest/v1/profiles?[redacted]'],
    [`Unexpected token 'N', "Nguyen Van"... is not valid JSON`, `Unexpected token 'N', "[redacted]" is not valid JSON`],
    ['Bad output {"fullRewrittenCV": "private CV"} end', 'Bad output [json] end'],
  ])('%s', (input, expected) => expect(redactText(input)).toBe(expected));

  it.each([
    'position 123 (line 1 column 124)',
    'react@18.3.1 and @sentry/core@10.58.0',
    'GET /api/candidates/01234567-8901-4234-a567-890123456789/status',
    'release 4cf93644dd28b07a01234567890b16f0989840ca deployed',
    'quota_commit_failed',
    'Price 1990000 VND, order 20261122',
  ])('leaves diagnostic text alone: %s', (input) => expect(redactText(input)).toBe(input));
});

describe('scrubTelemetry ids and scrubEvent/scrubBreadcrumb (SEC-2)', () => {
  it('keeps ids byte-for-byte even when they contain phone-shaped runs', () => {
    const ids = { event_id: 'a0912345678b4c5d6e7f8a9b0c1d2e3f', trace_id: '0912345678abcdef0912345678abcdef', release: '4cf93644dd28b07a01234567890b16f0989840ca', user: { id: '0912345678-uuid' } };
    expect(scrubTelemetry(ids)).toEqual(ids);
  });

  it('keeps only allowlisted request fields and user.id', () => {
    const event = {
      request: { method: 'POST', url: 'https://x.test/api/analyze?email=a@b.co', data: '{"cvText":"x"', cookies: { sb: 'jwt' }, query_string: 'email=a@b.co', headers: { 'User-Agent': 'ua', Authorization: 'Bearer t', 'X-Forwarded-For': '203.0.113.7', Referer: 'https://x.test/?q=1' } },
      user: { id: 'u1', email: 'a@b.co', ip_address: '203.0.113.7' },
    };
    expect(scrubEvent(event)).toEqual({ request: { method: 'POST', url: 'https://x.test/api/analyze?[redacted]', headers: { 'User-Agent': 'ua' } }, user: { id: 'u1' } });
  });

  it('rebuilds console breadcrumbs from the leading string, Errors and short codes', () => {
    const crumb = { category: 'console', message: 'joined a@b.co {"details":"x"}', data: { logger: 'console', arguments: ['x'] } };
    const input = ['Profile deletion failed:', { code: '23505', details: 'Key (email)=(a@b.co)' }, new TypeError('bad a@b.co'), 'second string 0912345678'];
    expect(scrubBreadcrumb(crumb, { input })).toEqual({ category: 'console', message: 'Profile deletion failed: [code=23505] TypeError: bad [email]', data: { logger: 'console' } });
  });
});

describe('redactText cost and size cap (SEC-2)', () => {
  it('truncates long text and stays fast on backtracking-prone input', () => {
    expect(redactText('a'.repeat(5000))).toBe(`${'a'.repeat(4096)}…[truncated]`);
    const started = performance.now();
    for (const input of ['a'.repeat(80_000), '{"a":'.repeat(20_000), 'a.'.repeat(40_000), Buffer.from('x'.repeat(60_000)).toString('base64')]) redactText(input);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
