// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { AnalysisResult, ParsedCV } from '../../services/ai';
import { UI_LABELS } from '../../translations';

const ui = vi.hoisted(() => ({ lang: 'vi' as 'vi' | 'en' }));
const analysis = vi.hoisted(() => ({ jd: 'Backend Engineer at Acme. Go, Postgres.' as string | undefined, generating: new Set<string>() }));
const rpc = vi.hoisted(() => vi.fn());

vi.mock('../../context/UIContext', async () => {
  const { UI_LABELS: labels } = await import('../../translations');
  return { useUI: () => ({ t: labels[ui.lang], reportLanguage: ui.lang }) };
});
vi.mock('../../context/AnalysisContext', () => ({
  useAnalysis: () => ({ getAnalysisJd: () => analysis.jd, parsedCVGeneratingIds: analysis.generating }),
}));
vi.mock('../../lib/supabase', () => ({
  supabase: { rpc },
  withAuthRetry: (fn: () => unknown) => fn(),
}));
vi.mock('../../lib/sentry', () => ({ captureException: vi.fn() }));
vi.mock('../../lib/ga4', () => ({ trackEvent: vi.fn() }));

import { SaveApplicationAction } from '../../components/views/result/SaveApplicationAction';

const parsedCV = { personal_information: { full_name: 'Nguyen Van A', contact: {}, summary: 'Dev' } } as unknown as ParsedCV;
const result = {
  id: 'r1', matchScore: 72, passProbability: 'Cao', jobTitle: 'Backend Engineer', cvName: 'cv.pdf', language: 'vi',
  parsedCV,
  detailedComparison: { skills: [{ requirement: 'Go', status: 'matched', cvEvidence: 'Go 3y', verification: 'met' }] },
} as unknown as AnalysisResult;
const letter = { content: 'Kính gửi Acme,\n\nThư A.', language: 'vi' as const, employerName: 'Acme', roleTitle: 'Backend Engineer' };

beforeEach(() => {
  ui.lang = 'vi';
  analysis.jd = 'Backend Engineer at Acme. Go, Postgres.';
  analysis.generating = new Set();
  rpc.mockReset();
});
afterEach(cleanup);

const button = (labels = UI_LABELS.vi) => screen.getByRole('button', { name: new RegExp(labels.saveApplication, 'i') });

describe('SaveApplicationAction', () => {
  it('idle → saving → saved; sends one atomic RPC without the letter', async () => {
    let resolve!: (v: unknown) => void;
    rpc.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    render(<SaveApplicationAction selectedResult={result} coverLetter={null} />);

    const btn = button();
    expect(btn.getAttribute('title')).toBe(UI_LABELS.vi.saveApplicationHint);
    fireEvent.click(btn);
    expect(await screen.findByText(UI_LABELS.vi.saveApplicationSaving)).toBeTruthy();
    // Double click while saving: still one request.
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.vi.saveApplicationSaving }));
    expect(rpc).toHaveBeenCalledTimes(1);

    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe('save_application');
    expect(args).toMatchObject({
      p_source_analysis_id: 'r1', p_language: 'vi', p_role_title: 'Backend Engineer', p_company_name: null,
      p_cv_parsed: parsedCV, p_cv_file_name: 'cv.pdf', p_jd_text: analysis.jd,
      p_cover_letter_text: null, p_cover_letter_language: null,
    });
    expect(args.p_analysis).toEqual({
      matchScore: 72, passProbability: 'Cao',
      requirements: [{ requirement: 'Go', status: 'matched', cvEvidence: 'Go 3y', verification: 'met' }],
    });
    expect(args).not.toHaveProperty('p_user_id');

    resolve({ data: { id: 'app1', created: true }, error: null });
    const done = await screen.findByRole('button', { name: UI_LABELS.vi.saveApplicationSaved });
    expect((done as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/nộp/)).toBeNull();
  });

  it('snapshots the cover letter that is currently shown', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'app1', created: true }, error: null });
    render(<SaveApplicationAction selectedResult={result} coverLetter={letter} />);
    fireEvent.click(button());
    await screen.findByRole('button', { name: UI_LABELS.vi.saveApplicationSaved });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_cover_letter_text: letter.content, p_cover_letter_language: 'vi', p_company_name: 'Acme' });
  });

  it('already saved: says the earlier materials were kept', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'app1', created: false }, error: null });
    render(<SaveApplicationAction selectedResult={result} coverLetter={letter} />);
    fireEvent.click(button());
    expect(await screen.findByText(UI_LABELS.vi.saveApplicationAlreadySaved)).toBeTruthy();
  });

  it('error: generic message, no DB detail, retry allowed', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'invalid_application' } });
    render(<SaveApplicationAction selectedResult={result} coverLetter={null} />);
    fireEvent.click(button());
    expect((await screen.findByRole('alert')).textContent).toBe(UI_LABELS.vi.saveApplicationError);
    expect(screen.queryByText(/invalid_application/)).toBeNull();
    rpc.mockResolvedValueOnce({ data: { id: 'app1', created: true }, error: null });
    fireEvent.click(button());
    await screen.findByRole('button', { name: UI_LABELS.vi.saveApplicationSaved });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('never stores the analyze fallback title as role', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'app1', created: true }, error: null });
    render(<SaveApplicationAction selectedResult={{ ...result, jobTitle: 'Job Position' }} coverLetter={null} />);
    fireEvent.click(button());
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc.mock.calls[0][1].p_role_title).toBeNull();
  });

  it('History result (no session JD): unavailable, explains why', () => {
    analysis.jd = undefined;
    render(<SaveApplicationAction selectedResult={result} coverLetter={null} />);
    expect((button() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(UI_LABELS.vi.coverLetterUnavailableHistory)).toBeTruthy();
  });

  it('parsed CV still generating / missing: unavailable', () => {
    analysis.generating = new Set(['r1']);
    const { rerender } = render(<SaveApplicationAction selectedResult={{ ...result, parsedCV: undefined }} coverLetter={null} />);
    expect(screen.getByText(UI_LABELS.vi.coverLetterWaitingParsedCv)).toBeTruthy();
    analysis.generating = new Set();
    rerender(<SaveApplicationAction selectedResult={{ ...result, id: 'r2', parsedCV: undefined }} coverLetter={null} />);
    expect(screen.getByText(UI_LABELS.vi.saveApplicationNoParsedCv)).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('EN labels', async () => {
    ui.lang = 'en';
    rpc.mockResolvedValueOnce({ data: { id: 'app1', created: true }, error: null });
    render(<SaveApplicationAction selectedResult={result} coverLetter={null} />);
    fireEvent.click(button(UI_LABELS.en));
    expect(await screen.findByRole('button', { name: UI_LABELS.en.saveApplicationSaved })).toBeTruthy();
  });
});
