// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { AnalysisResult, ParsedCV } from '../../services/ai';
import { UI_LABELS } from '../../translations';

const ui = vi.hoisted(() => ({ lang: 'vi' as 'vi' | 'en' }));
const analysis = vi.hoisted(() => ({ jd: 'Frontend Engineer at Globex' as string | undefined, generating: new Set<string>() }));

vi.mock('../../context/UIContext', async () => {
  const { UI_LABELS: labels } = await import('../../translations');
  return { useUI: () => ({ t: labels[ui.lang], reportLanguage: ui.lang }) };
});
vi.mock('../../context/AnalysisContext', () => ({
  useAnalysis: () => ({ getAnalysisJd: () => analysis.jd, parsedCVGeneratingIds: analysis.generating }),
}));
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}));

import { CoverLetterAction } from '../../components/views/result/CoverLetterAction';

const parsedCV = { personal_information: { full_name: 'Nguyen Van A', contact: {}, summary: 'Dev' } } as unknown as ParsedCV;
const result = { id: 'r1', matchScore: 80, parsedCV } as AnalysisResult;
const fetchMock = vi.fn();
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number) => ({ ok: false, status, json: async () => ({ error: 'Không thể tạo thư ứng tuyển. Vui lòng thử lại.' }) });

beforeEach(() => {
  ui.lang = 'vi';
  analysis.jd = 'Frontend Engineer at Globex';
  analysis.generating = new Set();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const openDialog = (labels = UI_LABELS.vi) => {
  fireEvent.click(screen.getByRole('button', { name: labels.coverLetterCreate }));
  return screen.getByRole('dialog');
};

describe('CoverLetterAction', () => {
  it('button is visible and opens the generator (VI)', () => {
    render(<CoverLetterAction selectedResult={result} />);
    openDialog();
    expect(screen.getByText(UI_LABELS.vi.coverLetterIntro)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tạo thư/ })).toBeTruthy();
  });

  it('loading → success → copy → regenerate', async () => {
    let resolve!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CoverLetterAction selectedResult={result} />);
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: /Tạo thư/ }));
    expect(await screen.findByText(UI_LABELS.vi.coverLetterGenerating)).toBeTruthy();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/rewrite-cv');
    expect(JSON.parse(init.body)).toEqual({ action: 'cover_letter', jd: analysis.jd, parsedCV, language: 'vi' });
    expect(init.headers.Authorization).toBe('Bearer tok');

    resolve(ok({ content: 'Kính gửi Bộ phận Tuyển dụng,\n\nThư thử nghiệm.', language: 'vi' }));
    expect((await screen.findByTestId('cover-letter-content')).textContent).toContain('Thư thử nghiệm.');

    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.vi.coverLetterCopy }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Kính gửi Bộ phận Tuyển dụng,\n\nThư thử nghiệm.'));
    expect(await screen.findByText(UI_LABELS.vi.coverLetterCopied)).toBeTruthy();

    fetchMock.mockResolvedValueOnce(ok({ content: 'Bản thứ hai.', language: 'vi' }));
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.vi.coverLetterRegenerate }));
    expect((await screen.findByTestId('cover-letter-content')).textContent).toBe('Bản thứ hai.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('EN labels and EN language selection', async () => {
    ui.lang = 'en';
    fetchMock.mockResolvedValue(ok({ content: 'Dear Hiring Manager,', language: 'en' }));
    render(<CoverLetterAction selectedResult={result} />);
    openDialog(UI_LABELS.en);
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.en.coverLetterGenerate }));
    await screen.findByTestId('cover-letter-content');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).language).toBe('en');
  });

  it('language toggle overrides the default', async () => {
    fetchMock.mockResolvedValue(ok({ content: 'Dear Hiring Manager,', language: 'en' }));
    render(<CoverLetterAction selectedResult={result} />);
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'en' }));
    fireEvent.click(screen.getByRole('button', { name: /Tạo thư/ }));
    await screen.findByTestId('cover-letter-content');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).language).toBe('en');
  });

  it('fidelity fallback shows the safe translated message', async () => {
    fetchMock.mockResolvedValue(ok({ content: '', language: 'vi', fidelityFallback: true }));
    render(<CoverLetterAction selectedResult={result} />);
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: /Tạo thư/ }));
    expect((await screen.findByRole('alert')).textContent).toBe(UI_LABELS.vi.coverLetterFallback);
  });

  it.each([
    [429, 'coverLetterRateLimited'],
    [504, 'coverLetterTimeout'],
    [500, 'coverLetterError'],
  ] as const)('HTTP %s → translated error, never the server string', async (status, key) => {
    ui.lang = 'en';
    fetchMock.mockResolvedValue(fail(status));
    render(<CoverLetterAction selectedResult={result} />);
    openDialog(UI_LABELS.en);
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.en.coverLetterGenerate }));
    expect((await screen.findByRole('alert')).textContent).toBe(UI_LABELS.en[key]);
  });

  it('disabled for history results (no session JD)', () => {
    analysis.jd = undefined;
    render(<CoverLetterAction selectedResult={result} />);
    expect((screen.getByRole('button', { name: UI_LABELS.vi.coverLetterCreate }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(UI_LABELS.vi.coverLetterUnavailableHistory)).toBeTruthy();
  });

  it('disabled while the parsed CV is still being generated', () => {
    analysis.generating = new Set(['r1']);
    render(<CoverLetterAction selectedResult={{ ...result, parsedCV: undefined }} />);
    expect((screen.getByRole('button', { name: UI_LABELS.vi.coverLetterCreate }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(UI_LABELS.vi.coverLetterWaitingParsedCv)).toBeTruthy();
  });
});
