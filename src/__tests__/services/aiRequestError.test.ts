// M2-B regression for M2-A P2-5 (typed HTTP errors, localized text) and P2-6 (empty extraction).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiRequestError, analyzeCV, localizeAiError, parseCV, rewriteFullCV } from '../../services/ai/analysisService';

vi.mock('mammoth', () => ({ default: { extractRawText: async () => ({ value: '  \n ' }) } }));
import { processFile } from '../../hooks/useFileProcessor';

const T = {
  aiErrorAuthRequired: 'AUTH', aiErrorAccountLocked: 'LOCKED', aiErrorInputTooLarge: 'TOO_LARGE {max}',
  aiErrorRateLimited: 'RATE', aiErrorBusy: 'BUSY', aiErrorTimeout: 'TIMEOUT', monthlyUsageLimitExceeded: 'MONTHLY',
};

const respond = (status: number, body: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }));

afterEach(() => vi.restoreAllMocks());

describe('AiRequestError from the AI fetch wrappers', () => {
  it.each([
    ['analyze', () => analyzeCV('jd', 'cv', 'text/plain')],
    ['parse', () => parseCV('cv', 'text/plain')],
    ['rewrite', () => rewriteFullCV('jd', 'cv', 'text/plain')],
  ])('%s keeps status, retryable flag and server message', async (_name, call) => {
    respond(503, { error: 'Hệ thống AI đang quá tải.', retryable: true });
    const err = await call().catch((e) => e);
    expect(err).toBeInstanceOf(AiRequestError);
    expect(err).toMatchObject({ status: 503, retryable: true, message: 'Hệ thống AI đang quá tải.' });
  });

  it('falls back to an HTTP message when the body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>', { status: 502 }));
    const err = await analyzeCV('jd', 'cv', 'text/plain').catch((e) => e);
    expect(err).toMatchObject({ status: 502, retryable: false, message: 'Phân tích thất bại (HTTP 502)' });
  });
});

describe('localizeAiError', () => {
  const e = (status: number, body: Record<string, unknown> = {}) =>
    new AiRequestError('server text', status, body.retryable === true, body);
  it('maps statuses to localized strings', () => {
    expect(localizeAiError(e(401), T)).toBe('AUTH');
    expect(localizeAiError(e(403), T)).toBe('LOCKED');
    expect(localizeAiError(e(413, { maxChars: 50000 }), T)).toBe('TOO_LARGE 50000');
    expect(localizeAiError(e(429), T)).toBe('RATE');
    expect(localizeAiError(e(429, { used: 5, limit: 5 }), T)).toBe('MONTHLY');
    expect(localizeAiError(e(503, { retryable: true }), T)).toBe('BUSY');
    expect(localizeAiError(e(504, { retryable: true }), T)).toBe('TIMEOUT');
  });
  it('keeps the server message for other statuses and plain errors', () => {
    expect(localizeAiError(e(500), T)).toBe('server text');
    expect(localizeAiError(e(503), T)).toBe('server text'); // non-retryable 503 (account verification)
    expect(localizeAiError(new Error('plain'), T)).toBe('plain');
  });
});

describe('empty extracted content is rejected before any request', () => {
  it('DOCX with no text', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const docx = new File([new Uint8Array([1, 2, 3])], 'cv.docx');
    await expect(processFile(docx, 'u1')).rejects.toThrow(/Không thể đọc nội dung "cv.docx"/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('text file with only whitespace', async () => {
    await expect(processFile(new File(['  \n\t '], 'cv.txt', { type: 'text/plain' }), 'u1')).rejects.toThrow(/Không thể đọc nội dung/);
  });
  it('non-empty text file is unchanged', async () => {
    await expect(processFile(new File(['Data analyst'], 'cv.txt', { type: 'text/plain' }), 'u1')).resolves.toEqual({ data: 'Data analyst', mimeType: 'text/plain' });
  });
});
