// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import type { AnalysisResult, ParsedCV } from '../../services/ai';
import { UI_LABELS } from '../../translations';

const ui = vi.hoisted(() => ({ lang: 'vi' as 'vi' | 'en' }));

vi.mock('../../context/UIContext', async () => {
  const { UI_LABELS: labels } = await import('../../translations');
  return { useUI: () => ({ t: labels[ui.lang], reportLanguage: ui.lang }) };
});
vi.mock('../../context/AnalysisContext', () => ({
  useAnalysis: () => ({ getAnalysisJd: () => 'Frontend Engineer at Globex', parsedCVGeneratingIds: new Set() }),
}));
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}));

import { CoverLetterAction } from '../../components/views/result/CoverLetterAction';

const parsedCV = { personal_information: { full_name: 'Nguyen Van A', contact: {}, summary: 'Dev' } } as unknown as ParsedCV;
const result = {
  id: 'r1',
  matchScore: 80,
  parsedCV,
  detailedComparison: {
    skills: [{ requirement: 'React', status: 'matched', priority: 'required', cvEvidence: 'React', verification: 'met' }],
    experience: [{ requirement: '5 years', status: 'partial' }],
    tools: [],
    education: [],
    keywords: [],
  },
} as unknown as AnalysisResult;
const LETTER = 'Kính gửi Bộ phận Tuyển dụng,\n\nTôi là chuyên gia Canva.';
const fetchMock = vi.fn();
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number) => ({ ok: false, status, json: async () => ({ error: 'x' }) });

beforeEach(() => {
  ui.lang = 'vi';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const withLetter = async (labels = UI_LABELS.vi) => {
  fetchMock.mockResolvedValueOnce(ok({ content: LETTER, language: ui.lang, employerName: 'Globex', roleTitle: 'Frontend Engineer' }));
  render(<CoverLetterAction selectedResult={result} />);
  fireEvent.click(screen.getByRole('button', { name: labels.coverLetterCreate }));
  fireEvent.click(screen.getByRole('button', { name: labels.coverLetterGenerate }));
  await screen.findByTestId('cover-letter-content');
};
const reviewButton = (labels = UI_LABELS.vi) => screen.getByRole('button', { name: labels.reviewAction });

describe('Application review (P1B)', () => {
  it('review action appears only once a letter exists', async () => {
    render(<CoverLetterAction selectedResult={result} />);
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.vi.coverLetterCreate }));
    expect(screen.queryByRole('button', { name: UI_LABELS.vi.reviewAction })).toBeNull();
    cleanup();
    await withLetter();
    expect(reviewButton()).toBeTruthy();
  });

  it('sends letter, verified names and canonical requirement context; loading → needs review grouped by severity', async () => {
    await withLetter();
    let resolve!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    fireEvent.click(reviewButton());
    expect(await screen.findByText(UI_LABELS.vi.reviewChecking)).toBeTruthy();

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body).toEqual({
      action: 'application_review',
      jd: 'Frontend Engineer at Globex',
      parsedCV,
      coverLetter: LETTER,
      language: 'vi',
      employerName: 'Globex',
      roleTitle: 'Frontend Engineer',
      requirements: [
        { requirement: 'React', status: 'matched', priority: 'required', cvEvidence: 'React' },
        { requirement: '5 years', status: 'partial' },
      ],
    });

    resolve(ok({
      verdict: 'review',
      findings: [
        { category: 'numeric_claim', severity: 'high', message: 'Thư nói 10 năm, CV chỉ có 8 năm.', source: 'cover_letter' },
        { category: 'unsupported_claim', severity: 'medium', message: 'Cụm “chuyên gia Canva” mạnh hơn CV.', source: 'cover_letter' },
        { category: 'tone', severity: 'low', message: 'Mở đầu còn chung chung.', source: 'cover_letter' },
      ],
    }));
    const panel = await screen.findByTestId('application-review');
    expect(within(panel).getByText(UI_LABELS.vi.reviewNeedsReview)).toBeTruthy();
    expect(within(panel).getByText(UI_LABELS.vi.reviewSeverityHigh)).toBeTruthy();
    expect(panel.querySelector('[data-severity="high"]')?.textContent).toContain('10 năm');
    expect(panel.querySelector('[data-severity="medium"]')?.textContent).toContain('Canva');
    expect(panel.querySelector('[data-severity="low"]')?.textContent).toContain('chung chung');
    expect(within(panel).getByText(UI_LABELS.vi.reviewNoRevision)).toBeTruthy();
    expect(panel.textContent).not.toMatch(/%|điểm số/);
  });

  it('ready verdict (EN) with a low finding', async () => {
    ui.lang = 'en';
    await withLetter(UI_LABELS.en);
    fetchMock.mockResolvedValueOnce(ok({ verdict: 'ready', findings: [{ category: 'tone', severity: 'low', message: 'Generic opening.', source: 'cover_letter' }] }));
    fireEvent.click(reviewButton(UI_LABELS.en));
    const panel = await screen.findByTestId('application-review');
    expect(within(panel).getByText('Ready')).toBeTruthy();
    expect(within(panel).getByText(UI_LABELS.en.reviewReadyNote)).toBeTruthy();
    expect(within(panel).queryByText(UI_LABELS.en.reviewNoRevision)).toBeNull();
  });

  it('revised letter: copy, then use it in place of the current letter (names kept)', async () => {
    const before = structuredClone(result);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await withLetter();
    fetchMock.mockResolvedValueOnce(ok({
      verdict: 'review',
      findings: [{ category: 'unsupported_claim', severity: 'medium', message: 'm', source: 'cover_letter' }],
      revisedCoverLetter: 'Kính gửi Bộ phận Tuyển dụng,\n\nTôi dùng Canva.',
    }));
    fireEvent.click(reviewButton());
    const panel = await screen.findByTestId('application-review');
    expect(within(panel).getByTestId('revised-cover-letter').textContent).toContain('Tôi dùng Canva.');

    fireEvent.click(within(panel).getByRole('button', { name: UI_LABELS.vi.coverLetterCopy }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Kính gửi Bộ phận Tuyển dụng,\n\nTôi dùng Canva.'));

    fireEvent.click(within(panel).getByRole('button', { name: UI_LABELS.vi.reviewUseRevised }));
    expect(screen.getByTestId('cover-letter-content').textContent).toContain('Tôi dùng Canva.');
    expect(screen.queryByTestId('application-review')).toBeNull();

    fetchMock.mockResolvedValueOnce(ok({ verdict: 'ready', findings: [] }));
    fireEvent.click(reviewButton());
    await screen.findByTestId('application-review');
    const again = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(again).toMatchObject({ coverLetter: 'Kính gửi Bộ phận Tuyển dụng,\n\nTôi dùng Canva.', employerName: 'Globex', roleTitle: 'Frontend Engineer' });
    // Review and "use revised" never touch the analysis result (score, status, verification, parsed CV).
    expect(result).toEqual(before);
  });

  it('errors map to translated messages (429, 504, generic)', async () => {
    await withLetter();
    for (const [status, text] of [[429, UI_LABELS.vi.reviewRateLimited], [504, UI_LABELS.vi.reviewTimeout], [500, UI_LABELS.vi.reviewError]] as const) {
      fetchMock.mockResolvedValueOnce(fail(status));
      fireEvent.click(reviewButton());
      expect((await screen.findByRole('alert')).textContent).toBe(text);
    }
  });

  it('double submit is prevented: review and regenerate are disabled while reviewing', async () => {
    await withLetter();
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.click(reviewButton());
    await screen.findByText(UI_LABELS.vi.reviewChecking);
    expect((reviewButton() as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: UI_LABELS.vi.coverLetterRegenerate }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(reviewButton());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('regenerating the letter clears the previous review', async () => {
    await withLetter();
    fetchMock.mockResolvedValueOnce(ok({ verdict: 'ready', findings: [] }));
    fireEvent.click(reviewButton());
    await screen.findByTestId('application-review');
    fetchMock.mockResolvedValueOnce(ok({ content: 'Bản mới.', language: 'vi', employerName: '', roleTitle: '' }));
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.vi.coverLetterRegenerate }));
    await waitFor(() => expect(screen.getByTestId('cover-letter-content').textContent).toBe('Bản mới.'));
    expect(screen.queryByTestId('application-review')).toBeNull();
  });
});
