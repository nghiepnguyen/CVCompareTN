import { describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  allowedOrigins,
  applyCors,
  declaredBodyBytes,
  handlePreflight,
  rejectOversizedBody,
  BODY_LIMITS,
} from '../http/guard.js';

function req(headers: Record<string, string> = {}, method = 'POST'): VercelRequest {
  return { method, headers } as unknown as VercelRequest;
}

function res() {
  const headers: Record<string, string> = {};
  const json = vi.fn();
  const end = vi.fn();
  const status = vi.fn(() => ({ json, end }));
  return {
    value: { setHeader: (k: string, v: string) => { headers[k] = v; }, status } as unknown as VercelResponse,
    headers,
    status,
    json,
    end,
  };
}

describe('cors guard', () => {
  it('echoes an allowlisted origin instead of *', () => {
    const r = res();
    applyCors(req({ origin: 'https://cvfit.pro' }), r.value);
    expect(r.headers['Access-Control-Allow-Origin']).toBe('https://cvfit.pro');
    expect(r.headers['Vary']).toBe('Origin');
  });

  it('does not add CORS headers for unknown or missing origins', () => {
    for (const headers of [{ origin: 'https://evil.example' }, {}]) {
      const r = res();
      applyCors(req(headers), r.value);
      expect(r.headers['Access-Control-Allow-Origin']).toBeUndefined();
    }
  });

  it('allows localhost only outside production', () => {
    expect(allowedOrigins('production')).not.toContain('http://localhost:5173');
    expect(allowedOrigins('development')).toContain('http://localhost:5173');
  });

  it('answers preflight with 204 and end()', () => {
    const r = res();
    expect(handlePreflight(req({}, 'OPTIONS'), r.value)).toBe(true);
    expect(r.status).toHaveBeenCalledWith(204);
    expect(r.end).toHaveBeenCalled();
  });
});

describe('body limit guard', () => {
  it('rejects a declared body over the limit', () => {
    const r = res();
    expect(rejectOversizedBody(req({ 'content-length': String(BODY_LIMITS.json + 1) }), r.value, BODY_LIMITS.json)).toBe(true);
    expect(r.status).toHaveBeenCalledWith(413);
  });

  it('allows bodies at the limit and without content-length', () => {
    const r = res();
    expect(rejectOversizedBody(req({ 'content-length': String(BODY_LIMITS.json) }), r.value, BODY_LIMITS.json)).toBe(false);
    expect(rejectOversizedBody(req(), r.value, BODY_LIMITS.json)).toBe(false);
  });

  it('reads content-length defensively', () => {
    expect(declaredBodyBytes(req({ 'content-length': '123' }))).toBe(123);
    expect(declaredBodyBytes(req({ 'content-length': 'nope' }))).toBeNull();
    expect(declaredBodyBytes(req({ 'content-length': '-1' }))).toBeNull();
    expect(declaredBodyBytes(req())).toBeNull();
  });
});
