// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const extractRawText = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: () => getSession() } },
}));
vi.mock('mammoth', () => ({ default: { extractRawText: (...args: unknown[]) => extractRawText(...args) } }));

import { extractJdText, JdExtractError, JD_FILE_ACCEPT } from '../../lib/extractJdText';

const fetchMock = vi.fn();

// jsdom's File lacks text()/arrayBuffer(); browsers have both.
function file(name: string, content = 'Synthetic JD body', type = '') {
  const f = new File([content], name, { type });
  Object.assign(f, {
    text: async () => content,
    arrayBuffer: async () => new TextEncoder().encode(content).buffer,
  });
  return f;
}

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  extractRawText.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function rejection(p: Promise<unknown>) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(JdExtractError);
  return err as JdExtractError;
}

describe('extractJdText', () => {
  it('advertises exactly txt, md, pdf and docx', () => {
    expect(JD_FILE_ACCEPT).toBe('.txt,.md,.pdf,.docx');
  });

  it('reads .txt and .md client-side', async () => {
    await expect(extractJdText(file('jd.txt', 'TXT JD'))).resolves.toBe('TXT JD');
    await expect(extractJdText(file('JD.MD', '# MD JD'))).resolves.toBe('# MD JD');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends .pdf to /api/extract-pdf with the bearer token', async () => {
    fetchMock.mockResolvedValue(okJson({ text: 'PDF JD text' }));
    await expect(extractJdText(file('jd.pdf', '%PDF-1.4', 'application/pdf'))).resolves.toBe('PDF JD text');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/extract-pdf');
    expect(init.headers.Authorization).toBe('Bearer tok');
    const body = JSON.parse(init.body);
    expect(body.base64Data).toMatch(/^data:application\/pdf;base64,/);
    expect(body.recaptchaToken).toBeUndefined();
  });

  it('falls back to reCAPTCHA for .pdf without a session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const executeRecaptcha = vi.fn().mockResolvedValue('captcha');
    fetchMock.mockResolvedValue(okJson({ text: 'PDF JD text' }));
    await extractJdText(file('jd.pdf'), executeRecaptcha);
    const [, init] = fetchMock.mock.calls[0];
    expect(executeRecaptcha).toHaveBeenCalledWith('extract_pdf');
    expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.parse(init.body).recaptchaToken).toBe('captcha');
  });

  it('turns a non-OK extract-pdf response into a controlled failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'File is not a valid PDF' }) });
    const err = await rejection(extractJdText(file('jd.pdf')));
    expect(err.code).toBe('failed');
    expect(err.message).toBe('File is not a valid PDF');
  });

  it('extracts .docx with mammoth', async () => {
    extractRawText.mockResolvedValue({ value: 'DOCX JD text' });
    await expect(extractJdText(file('jd.docx', 'PK'))).resolves.toBe('DOCX JD text');
    expect(new TextDecoder().decode(extractRawText.mock.calls[0][0].arrayBuffer)).toBe('PK');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['jd.doc', 'jd.png', 'jd.rtf', 'jd'])('rejects %s without reading it', async (name) => {
    const f = file(name);
    const textSpy = vi.spyOn(f, 'text');
    const err = await rejection(extractJdText(f));
    expect(err.code).toBe('unsupported');
    expect(textSpy).not.toHaveBeenCalled();
    expect(extractRawText).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects empty text from every supported format', async () => {
    expect((await rejection(extractJdText(file('jd.txt', '  \n ')))).code).toBe('empty');
    expect((await rejection(extractJdText(file('jd.md', '')))).code).toBe('empty');
    fetchMock.mockResolvedValue(okJson({ text: '   ' }));
    expect((await rejection(extractJdText(file('jd.pdf')))).code).toBe('empty');
    extractRawText.mockResolvedValue({ value: '' });
    expect((await rejection(extractJdText(file('jd.docx')))).code).toBe('empty');
  });
});
