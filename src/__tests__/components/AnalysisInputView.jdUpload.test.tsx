// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

const extractJdText = vi.fn();
const setJd = vi.fn();
const setError = vi.fn();
const executeRecaptcha = vi.fn();

vi.mock('../../lib/extractJdText', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/extractJdText')>();
  return { ...actual, extractJdText: (...args: unknown[]) => extractJdText(...args) };
});
vi.mock('react-google-recaptcha-v3', () => ({ useGoogleReCaptcha: () => ({ executeRecaptcha }) }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, setError }) }));
vi.mock('../../context/UIContext', () => ({
  useUI: () => ({
    t: new Proxy({}, { get: (_target, key) => String(key) }),
    reportLanguage: 'vi',
    setReportLanguage: vi.fn(),
    setIsSavedJDsModalOpen: vi.fn(),
    setIsSaveJDNameModalOpen: vi.fn(),
    setIsSavedCVsModalOpen: vi.fn(),
  }),
}));
vi.mock('../../context/AnalysisContext', () => ({
  useAnalysis: () => ({
    jd: '', setJd,
    cvText: '', setCvText: vi.fn(), cvInputMode: 'file', setCvInputMode: vi.fn(), files: [], setFiles: vi.fn(),
    isAnalyzing: false, isSavingJD: false, isSavingCV: false, saveCV: vi.fn(), savedCVs: [], savedCVFileName: null,
    handleAnalyze: vi.fn(), loadingCvIds: new Set(),
  }),
}));

import { AnalysisInputView } from '../../components/views/AnalysisInputView';
import { JdExtractError } from '../../lib/extractJdText';

function jdInput(container: HTMLElement) {
  const input = [...container.querySelectorAll('input[type=file]')].find((i) => !(i as HTMLInputElement).multiple);
  return input as HTMLInputElement;
}

beforeEach(() => {
  extractJdText.mockReset();
  setJd.mockReset();
  setError.mockReset();
});
afterEach(cleanup);

describe('AnalysisInputView JD upload', () => {
  it('advertises the shared JD contract without .doc or images', () => {
    const { container } = render(<AnalysisInputView />);
    expect(jdInput(container).accept).toBe('.txt,.md,.pdf,.docx');
  });

  it('uses the shared extractor (with reCAPTCHA) and sets the JD', async () => {
    extractJdText.mockResolvedValue('Synthetic JD');
    const { container } = render(<AnalysisInputView />);
    const file = new File(['x'], 'jd.docx');
    await act(async () => fireEvent.change(jdInput(container), { target: { files: [file] } }));
    expect(extractJdText).toHaveBeenCalledWith(file, executeRecaptcha);
    expect(setJd).toHaveBeenCalledWith('Synthetic JD');
    expect(setError).not.toHaveBeenCalled();
  });

  it('shows a visible error instead of setting the JD when the format is unsupported', async () => {
    extractJdText.mockRejectedValue(new JdExtractError('unsupported', 'doc'));
    const { container } = render(<AnalysisInputView />);
    await act(async () => fireEvent.change(jdInput(container), { target: { files: [new File(['x'], 'jd.doc')] } }));
    expect(setJd).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledWith('jdFileUnsupported');
  });
});
