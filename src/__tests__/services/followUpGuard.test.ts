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

// ---- R2: deterministic claim / honorific safety layer ----
const insert = (sentence: string, ok = EN_OK) => ok.replace(/\n\n(Kind regards|Trân trọng)$/, `\n\n${sentence}\n\n$1`);
const run = async (draft: string, language: 'vi' | 'en' = 'en', extra: Partial<FollowUpInput> = {}) => {
  generateContent.mockReset();
  generateContent.mockResolvedValue(reply(draft));
  return generateFollowUp({ ...base, language, ...extra }, 50_000);
};

// [group, language, unsafe sentence, harmless sentence]
const CLAIMS: Array<[string, 'en' | 'vi', string, string]> = [
  ['en-contact', 'en', 'As we discussed, I remain interested.', 'I remain keen on the interview process.'],
  ['en-contact', 'en', 'As discussed, I remain interested.', 'I would welcome a call to discuss the role.'],
  ['en-contact', 'en', 'Following our conversation, I wanted to reconnect.', 'I would welcome a conversation about the role.'],
  ['en-contact', 'en', 'I enjoyed our conversation about the team.', 'I would value a conversation about the team.'],
  ['en-contact', 'en', 'Thank you for the call about the role.', 'I am available for a call if helpful.'],
  ['en-contact', 'en', 'I enjoyed our meeting about the team.', 'I would value a meeting about the team.'],
  ['en-contact', 'en', 'Thank you for speaking with me about the role.', 'Thank you for reading my application.'],
  ['en-contact', 'en', 'When we spoke with you, the role sounded great.', 'I regularly spoke with stakeholders about APIs.'],
  ['en-contact', 'en', 'Speaking with your team was a pleasure.', 'Speaking clearly is a strength of mine.'],
  ['en-contact', 'en', 'Thank you for your reply.', 'Thank you for your time and consideration.'],
  ['en-contact', 'en', 'Thank you for the interview.', 'I would be glad to join an interview.'],
  ['en-contact', 'en', 'Thank you for interviewing me.', 'Thank you for reviewing my application.'],
  ['en-contact', 'en', 'My interview with your team went well.', 'I look forward to an interview with your team.'],
  ['en-contact', 'en', 'I am happy to accept the offer.', 'I admire what the company can offer to customers.'],
  ['en-contact', 'en', 'Thank you for your offer.', 'I like the offer of mentorship.'],
  ['en-contact', 'en', 'A colleague who referred me suggested this role.', 'I found this role on your careers page.'],
  ['en-contact', 'en', 'I applied through my referral.', 'I applied through your careers page.'],
  ['en-contact', 'en', 'I spoke with your recruiter and was encouraged.', 'I would be glad to speak with a recruiter.'],
  ['en-promise', 'en', 'I can start next week.', 'I can start contributing quickly with Node.js.'],
  ['en-promise', 'en', 'I am available to start soon.', 'I am available for questions.'],
  ['en-promise', 'en', 'I could start immediately.', 'I would start by learning the team processes.'],
  ['en-promise', 'en', 'I am available from next month.', 'I am available from my portfolio page.'],
  ['en-promise', 'en', 'I will call you tomorrow.', 'I would welcome a call.'],
  ['en-promise', 'en', 'I will follow up by email.', 'I would appreciate an update by email.'],
  ['en-contact', 'en', 'Our call during the screening was useful, and we spoke at length.', 'Our call for applications was a great idea.'],
  ['en-contact', 'en', 'During our call you mentioned the team.', 'I read the offer of mentorship with interest.'],
  ['en-promise', 'en', 'I guarantee strong results.', 'I care about strong results.'],
  ['en-promise', 'en', 'I promise to deliver.', 'I value keeping promises to my team.'],
  ['vi-contact', 'vi', 'Như đã trao đổi, tôi vẫn quan tâm.', 'Tôi mong có cơ hội phỏng vấn.'],
  ['vi-contact', 'vi', 'Theo cuộc trao đổi, tôi xin gửi thêm thông tin.', 'Tôi mong được trao đổi thêm về vị trí.'],
  ['vi-contact', 'vi', 'Cảm ơn cuộc trao đổi của anh chị.', 'Tôi rất mong có một cuộc trao đổi ngắn với anh/chị.'],
  ['vi-contact', 'vi', 'Buổi phỏng vấn vừa rồi rất thú vị.', 'Tôi mong sớm có lịch phỏng vấn.'],
  ['vi-contact', 'vi', 'Buổi phỏng vấn hôm trước rất thú vị.', 'Tôi quan tâm đến quy trình phỏng vấn.'],
  ['vi-contact', 'vi', 'Tôi đã phỏng vấn với đội ngũ.', 'Tôi muốn biết khi nào phỏng vấn.'],
  ['vi-contact', 'vi', 'Cảm ơn anh/chị đã phản hồi.', 'Cảm ơn anh/chị đã xem hồ sơ.'],
  ['vi-contact', 'vi', 'Cảm ơn anh/chị đã trả lời.', 'Cảm ơn anh/chị đã dành thời gian.'],
  ['vi-contact', 'vi', 'Tôi vui khi nhận lời mời làm việc.', 'Tôi quan tâm đến cơ hội làm việc.'],
  ['vi-contact', 'vi', 'Tôi được giới thiệu bởi một đồng nghiệp.', 'Tôi biết đến vị trí này qua trang tuyển dụng.'],
  ['vi-contact', 'vi', 'Người giới thiệu tôi đã liên hệ.', 'Tôi có thể cung cấp thông tin người giới thiệu nếu cần.'],
  ['vi-contact', 'vi', 'Cuộc trao đổi hôm trước rất hữu ích.', 'Tôi rất mong có một cuộc trao đổi ngắn với anh/chị.'],
  ['vi-promise', 'vi', 'Tôi có thể bắt đầu ngay.', 'Tôi có thể đóng góp với Node.js.'],
  ['vi-promise', 'vi', 'Tôi có thể đi làm ngay.', 'Tôi có thể trao đổi thêm.'],
  ['vi-promise', 'vi', 'Tôi sẵn sàng nhận việc.', 'Tôi sẵn sàng trao đổi.'],
  ['vi-promise', 'vi', 'Tôi sẵn sàng đi làm.', 'Tôi sẵn sàng học hỏi.'],
  ['vi-promise', 'vi', 'Tôi sẽ gọi cho anh chị.', 'Tôi mong nhận được cuộc gọi.'],
  ['vi-promise', 'vi', 'Tôi cam kết hiệu quả.', 'Tôi quan tâm đến hiệu quả.'],
  ['vi-promise', 'vi', 'Tôi hứa sẽ cố gắng.', 'Tôi sẽ cố gắng hết sức.'],
];

// R4: phrase-list correction. [language, sentence]
const R4_REJECT: Array<['en' | 'vi', string]> = [
  ['en', 'Thank you for speaking with me.'],
  ['en', 'I enjoyed speaking with your team.'],
  ['en', 'After speaking with your recruiter, I became interested.'],
  ['en', 'Since speaking with you, I have learned more.'],
  ['en', 'Thank you for our call yesterday.'],
  ['vi', 'Tôi được giới thiệu bởi một người quen.'],
  ['vi', 'Người giới thiệu tôi đã trao đổi với công ty.'],
  ['vi', 'Cảm ơn buổi phỏng vấn của anh/chị.'],
  ['vi', 'Cảm ơn cuộc gọi của anh/chị.'],
  ['vi', 'Như chúng ta đã trao đổi trước đó, tôi vẫn quan tâm.'],
  ['en', 'It was a pleasure speaking with you.'],
  ['en', 'It was great speaking with you last week.'],
  ['en', 'I appreciated speaking with you.'],
  ['en', 'Speaking with you was very helpful.'],
  ['vi', 'Anh ấy đã giới thiệu tôi với công ty.'],
  ['vi', 'Một người bạn đã giới thiệu tôi đến vị trí này.'],
];
const R4_ALLOW: Array<['en' | 'vi', string]> = [
  ['en', 'I look forward to speaking with you.'],
  ['en', 'I look forward to speaking with your team.'],
  ['en', 'I would welcome the chance of speaking with you.'],
  ['en', 'I hope to have the opportunity to speak with you.'],
  ['en', 'I would welcome a call.'],
  ['en', 'Our call for applications was a great idea.'],
  ['vi', 'Tôi xin gửi thư này để giới thiệu tôi và kinh nghiệm của mình.'],
  ['vi', 'Tôi mong có cơ hội phỏng vấn.'],
  ['vi', 'Tôi hy vọng nhận được cuộc gọi.'],
  ['vi', 'Tôi mong chúng ta có cơ hội trao đổi.'],
  ['en', 'It would be a pleasure speaking with you.'],
  ['en', 'It would be great speaking with you about the role.'],
  ['en', 'It would be nice speaking with you.'],
  ['en', 'I would appreciate speaking with you.'],
  ['en', 'Speaking with your team would be a privilege.'],
  ['vi', 'Tôi mong có dịp giới thiệu tôi với anh/chị.'],
  ['vi', 'Trong thư trước, tôi đã giới thiệu kinh nghiệm của mình.'],
  ['vi', 'Như chúng ta đã biết, công nghệ thay đổi nhanh.'],
];

describe('R4 claim phrase correction', () => {
  it.each(R4_REJECT)('%s rejected: %s', async (lang, sentence) => {
    const r = await run(insert(sentence, lang === 'vi' ? VI_OK : EN_OK), lang);
    expect(r.content).toBe('');
    expect(r.fidelityFallback).toBe(true);
    expect(r.guardMetrics).toMatchObject({ outcome: 'fallback', retryOutcome: 'invalid', geminiCalls: 2 });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it.each(R4_ALLOW)('%s allowed: %s', async (lang, sentence) => {
    const draft = insert(sentence, lang === 'vi' ? VI_OK : EN_OK);
    const r = await run(draft, lang);
    expect(r.guardMetrics).toMatchObject({ outcome: 'valid', geminiCalls: 1 });
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(r.content).toBe(draft);
  });
});

describe('R2 claim guard (table)', () => {
  it.each(CLAIMS)('%s unsafe is rejected: %s', async (_g, lang, unsafe) => {
    const ok = lang === 'vi' ? VI_OK : EN_OK;
    const r = await run(insert(unsafe, ok), lang);
    expect(r.content).toBe('');
    expect(r.fidelityFallback).toBe(true);
    expect(r.guardMetrics).toMatchObject({ outcome: 'fallback', retryOutcome: 'invalid', geminiCalls: 2 });
  });

  it.each(CLAIMS)('%s harmless stays valid: %s', async (_g, lang, _u, harmless) => {
    const ok = lang === 'vi' ? VI_OK : EN_OK;
    const draft = insert(harmless, ok);
    const r = await run(draft, lang);
    expect(r.guardMetrics).toMatchObject({ outcome: 'valid', geminiCalls: 1 });
    expect(r.content).toBe(draft);
  });

  it('detects case/whitespace/NFD variants of a phrase', async () => {
    const r = await run(insert('AS   WE\nDISCUSSED, hello.'));
    expect(r.fidelityFallback).toBe(true);
    const r2 = await run(insert('Như đã trao đổi.'.normalize('NFD')), 'vi', {});
    expect(r2.content).toBe('');
  });

  it('unsafe first draft, clean retry -> recovered with 2 calls', async () => {
    generateContent.mockReset();
    generateContent.mockResolvedValueOnce(reply(insert('Thank you for speaking with me.'))).mockResolvedValueOnce(reply(EN_OK));
    const r = await generateFollowUp(base, 50_000);
    expect(r.guardMetrics).toMatchObject({ outcome: 'recovered', geminiCalls: 2 });
    expect(r.content).toBe(EN_OK);
    expect(generateContent.mock.calls[1][0].contents[0].parts[0].text).toMatch(/interviews, offers, referrals/);
  });

  it('unsafe draft is never stripped and returned', async () => {
    const r = await run(insert('I can start immediately.'));
    expect(r.content).toBe('');
  });

  it('allowed company / role containing a listed phrase stays valid', async () => {
    const d = EN_OK.replace('Acme Corp', 'Referral Hub').replace('Backend Developer', 'Offer Analyst');
    const r = await run(d, 'en', { companyName: 'Referral Hub', roleTitle: 'Offer Analyst' });
    expect(r.guardMetrics.outcome).toBe('valid');
    const d2 = EN_OK.replace('Acme Corp', 'The Offer Co');
    expect((await run(d2, 'en', { companyName: 'The Offer Co' })).guardMetrics.outcome).toBe('valid');
  });
});

describe('R2 honorific rules', () => {
  const withHon = (s: string, ok = EN_OK) => ok.replace(/\n\n(Kind regards|Trân trọng)$/, `\n\n${s}\n\n$1`);
  it.each([
    ['Ms.Lan', 'en', 'Thank you, Ms.Lan, for your time.'],
    ['Ms. Lan', 'en', 'Thank you, Ms. Lan, for your time.'],
    ['lowercase chị Lan', 'vi', 'Cảm ơn chị Lan đã đọc hồ sơ.'],
    ['lowercase anh Minh', 'vi', 'Cảm ơn anh Minh đã đọc hồ sơ.'],
    ['lowercase ông Minh', 'vi', 'Cảm ơn ông Minh đã đọc hồ sơ.'],
    ['lowercase bà Lan', 'vi', 'Cảm ơn bà Lan đã đọc hồ sơ.'],
    ['lowercase cô Hoa', 'vi', 'Cảm ơn cô Hoa đã đọc hồ sơ.'],
    ['NFD Ông Minh', 'vi', 'Cảm ơn Ông Minh đã đọc hồ sơ.'.normalize('NFD')],
    ['mid-body Bà Lan', 'vi', 'Tôi mong sớm nhận được phản hồi từ Bà Lan.'],
  ] as const)('%s is invalid', async (_n, lang, s) => {
    const r = await run(withHon(s, lang === 'vi' ? VI_OK : EN_OK), lang);
    expect(r.content).toBe('');
    expect(r.fidelityFallback).toBe(true);
  });

  it.each([
    ['anh/chị vui lòng', 'Anh/chị vui lòng cho tôi biết tiến độ, anh/chị vui lòng phản hồi.'],
    ['tiếng Anh', 'Tôi sử dụng tiếng Anh thành thạo trong công việc.'],
  ] as const)('%s stays valid', async (_n, s) => {
    const r = await run(withHon(s, VI_OK), 'vi');
    expect(r.guardMetrics.outcome).toBe('valid');
  });

  it.each([
    ['Bà Rịa', 'Bà Rịa Holdings'],
    ['Cô Tô', 'Cô Tô Travel'],
  ])('allowed reference %s as company is valid (also NFD)', async (_n, company) => {
    for (const co of [company, company.normalize('NFD')]) {
      const d = VI_OK.replace('Acme Corp', co);
      const r = await run(d, 'vi', { companyName: company });
      expect(r.guardMetrics.outcome).toBe('valid');
    }
    const roleDraft = VI_OK.replace('Backend Developer', 'Quản lý Bà Rịa');
    expect((await run(roleDraft, 'vi', { roleTitle: 'Quản lý Bà Rịa' })).guardMetrics.outcome).toBe('valid');
  });
});

describe('R2 known gap (pinned, not fixed)', () => {
  it('invented one-word sign-off alone on the last line currently passes', async () => {
    const r = await run(EN_OK.replace('Kind regards', 'Kind regards,\nLan'));
    expect(r.guardMetrics.outcome).toBe('valid');
  });
});

describe('R2 fix round 1', () => {
  const NAMED_CV = CV + '\n- Mentored by Lan and Minh';
  const hon = (sentence: string, ok = EN_OK) => ok.replace(/\n\n(Kind regards|Trân trọng)$/, `\n\n${sentence}\n\n$1`);
  // Names are in the CV, so validateCoverLetter accepts them: only the honorific regex can reject these.
  it.each([
    ['Ms.Lan', 'en', 'Thank you, Ms.Lan, for your time.'],
    ['Ms. Lan', 'en', 'Thank you, Ms. Lan, for your time.'],
    ['chị Lan', 'vi', 'Cảm ơn chị Lan đã đọc hồ sơ.'],
    ['NFD Ông Minh', 'vi', 'Cảm ơn Ông Minh đã đọc hồ sơ.'.normalize('NFD')],
    ['mid-body bà Lan', 'vi', 'Tôi mong sớm nhận được phản hồi từ bà Lan.'],
  ] as const)('honorific isolated (name in CV): %s invalid', async (_n, lang, s) => {
    const r = await run(hon(s, lang === 'vi' ? VI_OK : EN_OK), lang, { cvText: NAMED_CV });
    expect(r.content).toBe('');
    expect(r.fidelityFallback).toBe(true);
  });

  it('control: CV-present name without honorific stays valid', async () => {
    const r = await run(hon('Thank you, Lan, for your time.'), 'en', { cvText: NAMED_CV });
    expect(r.guardMetrics.outcome).toBe('valid');
  });

  it.each(['Cảm ơn chị HR đã đọc hồ sơ.', 'Hồ sơ gửi anh/chị CV đính kèm.'])('acronym after honorific is valid: %s', async (s) => {
    const r = await run(hon(s, VI_OK), 'vi', { cvText: NAMED_CV + '\n- HR, CV' });
    expect(r.guardMetrics.outcome).toBe('valid');
  });

  it('short company "Ai" does not break "available to start" detection', async () => {
    const r = await run(hon('I am available to start.'), 'en', { companyName: 'Ai' });
    expect(r.content).toBe('');
    expect(r.fidelityFallback).toBe(true);
  });
});
