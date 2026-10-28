import { afterEach, expect, it, vi } from 'vitest';
import { parseCV } from '../../services/ai/analysisService';

afterEach(() => vi.unstubAllGlobals());

it('sends only CV inputs with correctly aligned auth and storage arguments', async () => {
  const parsedCV = { ats_evaluation: { years_of_experience: 5 } };
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ parsedCV }) });
  vi.stubGlobal('fetch', fetchMock);

  expect(await parseCV('CV content', 'text/plain', 'en', 'token', 'inline-pdf', 'pdf-path', 'data-path')).toEqual(parsedCV);
  const [url, request] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/parse-cv');
  expect(request.headers.Authorization).toBe('Bearer token');
  expect(JSON.parse(request.body)).toEqual({
    cvData: 'CV content', cvMimeType: 'text/plain', language: 'en',
    cvPdfInlineData: 'inline-pdf', cvPdfStoragePath: 'pdf-path', cvDataStoragePath: 'data-path',
  });
});
