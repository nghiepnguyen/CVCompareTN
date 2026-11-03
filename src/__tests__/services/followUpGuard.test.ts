import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateContent = vi.fn();
vi.mock('../../../_server-lib/ai/geminiClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../_server-lib/ai/geminiClient.js')>()),
  getGeminiClient: () => ({ models: { generateContent } }),
}));

import { buildFollowUpInstruction, generateFollowUp, MAX_FOLLOW_UP_CHARS, type FollowUpInput } from '../../../_server-lib/ai/followUpService.js';

const CV = `## Work experience
### Backend Developer — Acme Corp
- Built REST APIs with Node.js and PostgreSQL
## Skills
- Technical: Node.js, PostgreSQL`;
const JD = 'Acme hires a Backend Developer. Requirements: Node.js, Kubernetes, Terraform.';

const base: FollowUpInput = {
  cvText: CV, jd: JD, coverLetter: null, language: 'en', companyName: 'Acme Corp', roleTitle: 'Backend Developer', followUpNumber: 1,
};
const reply = (message: string) => ({ text: JSON.stringify({ message }), usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } });

const EN_OK = 'Dear Hiring Team,\n\nI recently applied for the Backend Developer role at Acme Corp and remain very interested. My experience building REST APIs with Node.js and PostgreSQL fits the role well. I would be glad to hear about next steps.\n\nKind regards';
const VI_OK = 'Kính gửi Anh/Chị phụ trách tuyển dụng,\n\nTôi đã ứng tuyển vị trí Backend Developer tại Acme Corp và vẫn rất quan tâm. Kinh nghiệm xây dựng REST APIs với Node.js và PostgreSQL phù hợp với vị trí này. Tôi mong sớm nhận được phản hồi.\n\nTrân trọng';

beforeEach(() => generateContent.mockReset());

describe('generateFollowUp', () => {
  it('EN draft valid, 1 call', async () => {
    generateContent.mockResolvedValueOnce(reply(EN_OK));
    const r = await generateFollowUp(base, 50_000);
    expect(r.content).toBe(EN_OK);
    expect(r.guardMetrics).toMatchObject({ outcome: 'valid', geminiCalls: 1 });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('VI draft with fixed salutation is valid', async () => {
    generateContent.mockResolvedValueOnce(reply(VI_OK));
    const r = await generateFollowUp({ ...base, language: 'vi' }, 50_000);
    expect(r.guardMetrics.outcome).toBe('valid');
    expect(r.content).toBe(VI_OK);
  });

  it('invented metric -> retry recovered with 2 calls', async () => {
    generateContent
      .mockResolvedValueOnce(reply(EN_OK + ' I grew revenue by 30%.'))
      .mockResolvedValueOnce(reply(EN_OK));
    const r = await generateFollowUp(base, 50_000);
    expect(r.guardMetrics).toMatchObject({ outcome: 'recovered', geminiCalls: 2 });
    expect(r.content).toBe(EN_OK);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('invented skill, invalid retry -> fallback with empty content', async () => {
    const bad = EN_OK + ' I also use Kubernetes daily.';
    generateContent.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply(bad));
    const r = await generateFollowUp(base, 50_000);
    expect(r.content).toBe('');
    expect(r.fidelityFallback).toBe(true);
    expect(r.guardMetrics).toMatchObject({ outcome: 'fallback', retryOutcome: 'invalid', geminiCalls: 2 });
  });

  it('invented person name in greeting is flagged: retry then fallback', async () => {
    const bad = EN_OK.replace('Dear Hiring Team', 'Dear Ms. Lan');
    generateContent.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply(bad));
    const r = await generateFollowUp(base, 50_000);
    expect(r.content).toBe('');
    expect(r.guardMetrics).toMatchObject({ outcome: 'fallback', retryOutcome: 'invalid', geminiCalls: 2 });
  });

  it('mid-body honorific name is invalid', async () => {
    const bad = EN_OK.replace('I would be glad', 'Thank you, Ms. Lan, for your time. I would be glad');
    generateContent.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply(EN_OK));
    const r = await generateFollowUp(base, 50_000);
    expect(r.guardMetrics).toMatchObject({ outcome: 'recovered', retryOutcome: 'recovered', geminiCalls: 2 });
  });

  it('VI honorific name mid-body is invalid, fixed Anh/Chị greeting is not', async () => {
    const bad = VI_OK.replace('Tôi mong', 'Cảm ơn Bà Lan. Tôi mong');
    generateContent.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply(VI_OK));
    const r = await generateFollowUp({ ...base, language: 'vi' }, 50_000);
    expect(r.guardMetrics).toMatchObject({ outcome: 'recovered', geminiCalls: 2 });
  });

  it('VI invented metric is invalid on first pass', async () => {
    generateContent.mockResolvedValueOnce(reply(VI_OK + ' Tôi đã tăng 30% doanh thu.')).mockResolvedValueOnce(reply(VI_OK));
    const r = await generateFollowUp({ ...base, language: 'vi' }, 50_000);
    expect(r.guardMetrics.outcome).toBe('recovered');
    expect(r.guardMetrics.firstPassViolations?.unsupportedNumber).toBeGreaterThan(0);
  });

  it('documents shortcut: sign-off with the CV name is valid', async () => {
    const draft = EN_OK.replace('Kind regards', 'Kind regards,\nJohn Smith');
    generateContent.mockResolvedValueOnce(reply(draft));
    const r = await generateFollowUp({ ...base, cvText: CV + '\nName: John Smith' }, 50_000);
    expect(r.guardMetrics.outcome).toBe('valid');
  });

  it('retry reminds about greeting and length', async () => {
    generateContent.mockResolvedValueOnce(reply(EN_OK + ' I grew revenue by 30%.')).mockResolvedValueOnce(reply(EN_OK));
    await generateFollowUp(base, 50_000);
    const retryText: string = generateContent.mock.calls[1][0].contents[0].parts[0].text;
    expect(retryText).toContain('exact fixed greeting');
    expect(retryText).toContain('length limit');
  });

  it('over-long draft goes to retry and is never returned', async () => {
    const long = EN_OK + ' ' + 'I remain interested. '.repeat(100);
    expect(long.length).toBeGreaterThan(MAX_FOLLOW_UP_CHARS);
    generateContent.mockResolvedValueOnce(reply(long)).mockResolvedValueOnce(reply(long));
    const r = await generateFollowUp(base, 50_000);
    expect(r.content).toBe('');
    expect(r.guardMetrics).toMatchObject({ outcome: 'fallback', geminiCalls: 2 });
  });

  it('claim only in the cover letter is flagged (letter is not CV corpus)', async () => {
    generateContent.mockResolvedValue(reply(EN_OK + ' I also use Terraform.'));
    const r = await generateFollowUp({ ...base, coverLetter: 'I use Terraform every day.' }, 50_000);
    expect(r.content).toBe('');
    expect(r.fidelityFallback).toBe(true);
  });

  it('user content: no matchScore, allowlist only, ordinal word not digit', async () => {
    generateContent.mockResolvedValueOnce(reply(EN_OK));
    const input = { ...base, followUpNumber: 2, cvText: 'Node developer', jd: 'Node role', companyName: 'Acme', roleTitle: 'Dev', matchScore: 'SECRETSCORE' } as FollowUpInput;
    await generateFollowUp(input, 50_000);
    const text: string = generateContent.mock.calls[0][0].contents[0].parts[0].text;
    expect(text).not.toMatch(/matchScore|SECRETSCORE/);
    expect(text).not.toMatch(/\d/);
    expect(text.toLowerCase()).toContain('second');
  });

  it('VI ordinal word', async () => {
    generateContent.mockResolvedValueOnce(reply(VI_OK));
    await generateFollowUp({ ...base, language: 'vi', followUpNumber: 2, cvText: 'Node developer', jd: 'Node role', companyName: 'Acme', roleTitle: 'Dev' }, 50_000);
    const text: string = generateContent.mock.calls[0][0].contents[0].parts[0].text;
    expect(text).toContain('lần thứ hai');
    expect(text).not.toMatch(/\d/);
  });
});

describe('buildFollowUpInstruction', () => {
  it('contains no-digits, no-availability and fixed salutation rules', () => {
    const vi_ = buildFollowUpInstruction('vi');
    expect(vi_).toMatch(/digit/i);
    expect(vi_).toMatch(/availab/i);
    expect(vi_).toContain('Kính gửi Anh/Chị phụ trách tuyển dụng,');
    expect(buildFollowUpInstruction('en')).toContain('Dear Hiring Team,');
    for (const l of ['vi', 'en'] as const) expect(buildFollowUpInstruction(l)).toContain('Do not claim or imply any prior contact, conversation, call, interview, referral, reply or offer');
  });
});
