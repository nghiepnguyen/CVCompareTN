import { describe, expect, it } from 'vitest';
import { scrubTelemetry } from '../scrubTelemetry';

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
