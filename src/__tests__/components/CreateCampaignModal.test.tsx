// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const extractJdText = vi.fn();

vi.mock('../../lib/extractJdText', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/extractJdText')>();
  return { ...actual, extractJdText: (...args: unknown[]) => extractJdText(...args) };
});
vi.mock('../../context/UIContext', () => ({
  useUI: () => ({ t: new Proxy({}, { get: (_target, key) => String(key) }) }),
}));

import { CreateCampaignModal } from '../../components/recruiter/CreateCampaignModal';
import { JdExtractError } from '../../lib/extractJdText';

const onCreate = vi.fn();

function setup() {
  render(<CreateCampaignModal open onClose={vi.fn()} onCreate={onCreate} />);
  const input = screen.getByTestId('jd-file-input') as HTMLInputElement;
  const jd = screen.getByPlaceholderText('createCampaignJdPlaceholder') as HTMLTextAreaElement;
  const submit = screen.getByRole('button', { name: 'createCampaignSubmit' }) as HTMLButtonElement;
  fireEvent.change(screen.getByPlaceholderText('createCampaignNamePlaceholder'), { target: { value: 'Smoke' } });
  return { input, jd, submit };
}

function pick(input: HTMLInputElement, name: string) {
  fireEvent.change(input, { target: { files: [new File(['x'], name)] } });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  extractJdText.mockReset();
  onCreate.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('CreateCampaignModal JD upload', () => {
  it('advertises only txt, md, pdf and docx', () => {
    const { input } = setup();
    expect(input.accept).toBe('.txt,.md,.pdf,.docx');
    expect(input.accept).not.toMatch(/\.doc(,|$)/);
  });

  it('puts extracted text into the JD and submits it', async () => {
    extractJdText.mockResolvedValue('Extracted synthetic JD');
    const { input, jd, submit } = setup();
    await act(async () => pick(input, 'jd.pdf'));
    expect(jd.value).toBe('Extracted synthetic JD');
    await act(async () => fireEvent.click(submit));
    expect(onCreate).toHaveBeenCalledWith('Smoke', 'Extracted synthetic JD', 'Extracted synthetic JD');
  });

  it('disables submit while extraction is pending', async () => {
    const pending = deferred<string>();
    extractJdText.mockReturnValue(pending.promise);
    const { input, submit } = setup();
    await act(async () => pick(input, 'jd.pdf'));
    expect(submit.disabled).toBe(true);
    fireEvent.submit(submit.closest('form')!);
    expect(onCreate).not.toHaveBeenCalled();
    await act(async () => pending.resolve('Done'));
    expect(submit.disabled).toBe(false);
  });

  it('shows an error and cannot submit the previous JD when a new extraction fails', async () => {
    extractJdText.mockResolvedValueOnce('Old valid JD').mockRejectedValueOnce(new JdExtractError('failed', 'boom'));
    const { input, jd, submit } = setup();
    await act(async () => pick(input, 'old.txt'));
    expect(jd.value).toBe('Old valid JD');
    await act(async () => pick(input, 'new.pdf'));
    expect(screen.getByText('createCampaignJdFileError')).toBeTruthy();
    expect(jd.value).toBe('');
    await act(async () => fireEvent.click(submit));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('shows the unsupported-format error for .doc', async () => {
    extractJdText.mockRejectedValue(new JdExtractError('unsupported', 'doc'));
    const { input, jd } = setup();
    await act(async () => pick(input, 'jd.doc'));
    expect(screen.getByText('jdFileUnsupported')).toBeTruthy();
    expect(jd.value).toBe('');
  });
});
