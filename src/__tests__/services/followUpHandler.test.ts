import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateContent = vi.fn();
vi.mock('../../../_server-lib/ai/geminiClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../_server-lib/ai/geminiClient.js')>()),
  getGeminiClient: () => ({ models: { generateContent } }),
}));

type Res = { data: unknown; error: unknown };
const state = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  profile: { has_permission: true, role: 'user', plan: 'free', plan_expires_at: null } as Record<string, unknown>,
  count: 0,
  inserts: [] as Record<string, unknown>[],
  countFilters: [] as unknown[][],
  queries: [] as { table: string; filters: unknown[][] }[],
  mutations: [] as string[],
  app: null as Res | null,
  appOwner: 'user-1',
  selects: {} as Record<string, string>,
  onApp: null as (() => void) | null,
  docs: null as Res | null,
  fuState: null as Res | null,
}));

vi.mock('../../../_server-lib/payment/supabaseAdmin.js', () => {
  const builder = (table: string) => {
    const filters: unknown[][] = [];
    state.queries.push({ table, filters });
    const b: Record<string, unknown> = {};
    const record = (name: string) => (...args: unknown[]) => { filters.push([name, ...args]); return b; };
    const result = (): Res => {
      if (table === 'applications') {
        state.onApp?.();
        const owned = filters.some((f) => f[0] === 'eq' && f[1] === 'user_id' && f[2] === state.appOwner);
        return owned ? state.app! : { data: null, error: null };
      }
      if (table === 'application_documents') return state.docs!;
      if (table === 'application_follow_up_state') return state.fuState!;
      return { data: state.profile, error: null };
    };
    Object.assign(b, {
      select: (cols?: string) => { state.selects[table] = String(cols); return b; }, eq: record('eq'), gte: () => b, contains: record('contains'), or: record('or'), abortSignal: () => b,
      maybeSingle: async () => result(),
      then: (res: (v: unknown) => unknown) => {
        if (table === 'analysis_log') state.countFilters.push(filters);
        return Promise.resolve(table === 'analysis_log' ? { count: state.count } : result()).then(res);
      },
    });
    for (const m of ['insert', 'update', 'upsert', 'delete']) b[m] = () => { state.mutations.push(`${table}.${m}`); return b; };
    return b;
  };
  return {
    getUserFromBearerToken: async () => state.user,
    getSupabaseAdmin: () => ({
      rpc: (name: string) => { state.mutations.push(`rpc.${name}`); return Promise.resolve({ data: null, error: null }); },
      from: (table: string) =>
        table === 'analysis_log'
          ? {
              insert: (row: Record<string, unknown>) => {
                state.inserts.push(row);
                return { abortSignal: () => Promise.resolve({ error: null }) };
              },
              select: () => builder(table),
            }
          : builder(table),
    }),
  };
});

import { handleRewriteCv } from '../../../_server-lib/rewriteCv/handler';

const APP_ID = '3f2a9c1e-5b4d-4e8a-9c0b-1d2e3f4a5b6c';
const PARSED_CV = {
  personal_information: { full_name: 'Nguyen Van A', contact: { email: 'secret@example.com' }, summary: 'SNAPSHOT_CV_SENTINEL backend developer.' },
  work_experience: [{
    company: 'Acme Corp', job_title: 'Backend Developer',
    duration: { start: '01/2019', end: '', is_current: true },
    responsibilities: ['Built REST APIs with Node.js and PostgreSQL'], achievements: [],
  }],
  skills: { technical_skills: ['Node.js', 'PostgreSQL'], soft_skills: [], hard_skills: [], tools_software: [], languages: [] },
};
const docs = (over: { letter?: Record<string, unknown> | null; cv?: boolean; jd?: boolean } = {}) => ({
  data: [
    ...(over.cv === false ? [] : [{ document_type: 'cv', content: { parsedCV: PARSED_CV }, language: null }]),
    ...(over.jd === false ? [] : [{ document_type: 'jd', content: { text: 'SNAPSHOT_JD_SENTINEL\u200B\u202E Acme hires a Backend Developer.' }, language: 'en' }]),
    ...(over.letter ? [over.letter] : []),
  ],
  error: null,
});
const LETTER = (language: string) => ({ document_type: 'cover_letter', content: { text: 'Previous letter\u200B\u202E text.' }, language });
const EN_OK = 'Dear Hiring Team,\n\nI recently applied for the Backend Developer role at Acme Corp and remain very interested. My experience building REST APIs with Node.js and PostgreSQL fits the role well. I would be glad to hear about next steps.\n\nKind regards';
const VI_OK = 'Kính gửi Anh/Chị phụ trách tuyển dụng,\n\nTôi đã ứng tuyển vị trí Backend Developer tại Acme Corp và vẫn rất quan tâm. Kinh nghiệm xây dựng REST APIs với Node.js và PostgreSQL phù hợp với vị trí này. Tôi mong sớm nhận được phản hồi.\n\nTrân trọng';
const reply = (message: string) => ({ text: JSON.stringify({ message }), usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } });
const call = (body: Record<string, unknown> = {}) => handleRewriteCv('Bearer t', { action: 'follow_up', applicationId: APP_ID, ...body });
const lastRow = () => state.inserts.at(-1)!;
const promptOf = (i = 0) => {
  const req = generateContent.mock.calls[i][0];
  return { system: req.config.systemInstruction as string, user: req.contents[0].parts[0].text as string };
};

beforeEach(() => {
  generateContent.mockReset();
  state.user = { id: 'user-1' };
  state.profile = { has_permission: true, role: 'user', plan: 'free', plan_expires_at: null };
  state.count = 0;
  state.inserts.length = 0;
  state.countFilters.length = 0;
  state.queries.length = 0;
  state.mutations.length = 0;
  state.appOwner = 'user-1';
  state.onApp = null;
  state.selects = {};
  state.app = { data: { id: APP_ID, status: 'applied', language: 'vi', company_name: 'Acme Corp', role_title: 'Backend Developer' }, error: null };
  state.docs = docs();
  state.fuState = { data: { follow_ups_since_reset: 0 }, error: null };
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('follow_up: request validation', () => {
  it.each(['cvText', 'jd', 'parsedCV', 'coverLetter', 'notes', 'matchScore', 'requirements', 'followUpCount', 'status'])(
    'body key %s → 400, no auth data, Gemini or DB',
    async (key) => {
      expect((await call({ [key]: 'x' })).status).toBe(400);
      expect(generateContent).not.toHaveBeenCalled();
      expect(state.queries).toHaveLength(0);
      expect(state.inserts).toHaveLength(0);
    }
  );

  it('invalid / missing applicationId → 400', async () => {
    expect((await call({ applicationId: 'nope' })).status).toBe(400);
    expect((await call({ applicationId: undefined })).status).toBe(400);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it.each(['fr', null, '', 1])('language %j → 400', async (language) => {
    expect((await call({ language })).status).toBe(400);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('valid minimal and valid with language → 200', async () => {
    generateContent.mockResolvedValue(reply(EN_OK));
    expect((await call()).status).toBe(200);
    expect((await call({ language: 'en' })).status).toBe(200);
  });
});

describe('follow_up: access and ownership', () => {
  it('unauthenticated → 401, locked → 403, no Gemini', async () => {
    state.user = null;
    expect((await call()).status).toBe(401);
    state.user = { id: 'user-1' };
    state.profile = { ...state.profile, has_permission: false };
    expect((await call()).status).toBe(403);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('shared document cap: count 5 (free) → 429, marker filter includes all document kinds', async () => {
    state.count = 5;
    expect((await call()).status).toBe(429);
    expect(generateContent).not.toHaveBeenCalled();
    const or = state.countFilters.flat().filter((f) => f[0] === 'or').map((f) => String(f[1])).join('|');
    for (const m of ['coverLetter', 'applicationReview', 'followUp']) expect(or).toContain(m);
  });

  it('filters both tables by user_id and never queries application_events', async () => {
    generateContent.mockResolvedValue(reply(EN_OK));
    await call();
    for (const t of ['applications', 'application_documents']) {
      const q = state.queries.find((x) => x.table === t)!;
      expect(q.filters).toContainEqual(['eq', 'user_id', 'user-1']);
    }
    expect(state.queries.some((q) => q.table === 'application_events')).toBe(false);
  });

  it('row owned by another user → same 404 as a nonexistent id', async () => {
    state.appOwner = 'user-2';
    const a = await call();
    state.app = { data: null, error: null };
    expect(await call({ applicationId: '11111111-2222-4333-8444-555555555555' })).toEqual(a);
    expect(a).toEqual({ status: 404, body: { error: 'Application not found' } });
    expect(generateContent).not.toHaveBeenCalled();
    expect(state.inserts).toHaveLength(0);
  });

  it('missing and cross-account both → identical 404, no Gemini, no log row', async () => {
    state.app = { data: null, error: null };
    const a = await call();
    const b = await call({ applicationId: '11111111-2222-4333-8444-555555555555' });
    expect(a).toEqual({ status: 404, body: { error: 'Application not found' } });
    expect(b).toEqual(a);
    expect(generateContent).not.toHaveBeenCalled();
    expect(state.inserts).toHaveLength(0);
  });

  it.each(['drafted', 'interview', 'offer', 'rejected', 'withdrawn'])('status %s → 409, no Gemini, no log row', async (status) => {
    state.app = { data: { id: APP_ID, status, language: 'vi', company_name: null, role_title: null }, error: null };
    expect(await call()).toEqual({ status: 409, body: { error: 'Follow-up not available' } });
    expect(generateContent).not.toHaveBeenCalled();
    expect(state.inserts).toHaveLength(0);
  });

  it('missing jd / missing cv / empty CV → 422', async () => {
    for (const d of [docs({ jd: false }), docs({ cv: false }), { data: [{ document_type: 'cv', content: { parsedCV: {} }, language: null }, ...docs().data.slice(1)], error: null }]) {
      state.docs = d;
      expect(await call()).toEqual({ status: 422, body: { error: 'Snapshot unavailable' } });
    }
    expect(generateContent).not.toHaveBeenCalled();
    expect(state.inserts).toHaveLength(0);
  });

  it('follow-up state query error → 503, no Gemini, no log row', async () => {
    state.fuState = { data: null, error: { message: 'boom' } };
    expect(await call()).toEqual({ status: 503, body: { error: 'Follow-up temporarily unavailable', retryable: true } });
    expect(generateContent).not.toHaveBeenCalled();
    expect(state.inserts).toHaveLength(0);
  });
});

describe('follow_up: generation from the snapshot', () => {
  it('prompt has snapshot CV/JD, no analysis, score or notes; number from the view', async () => {
    state.fuState = { data: { follow_ups_since_reset: 1 }, error: null };
    state.docs = docs({ letter: LETTER('en') });
    generateContent.mockResolvedValue(reply(EN_OK));
    await call();
    const all = promptOf().system + promptOf().user;
    expect(promptOf().user).toContain('SNAPSHOT_CV_SENTINEL');
    expect(promptOf().user).toContain('SNAPSHOT_JD_SENTINEL');
    expect(promptOf().user).toContain('Previous letter text.');
    expect(JSON.stringify(generateContent.mock.calls)).not.toMatch(/\\u200b|\\u202e|[\u200B\u202E]/i);
    expect(promptOf().user).toContain('second follow-up');
    for (const s of ['ANALYSIS_SENTINEL', 'matchScore', '77', 'NOTE_SENTINEL']) expect(all).not.toContain(s);
  });

  it('missing view row → first follow-up, 200', async () => {
    state.fuState = { data: null, error: null };
    generateContent.mockResolvedValue(reply(EN_OK));
    expect((await call()).status).toBe(200);
    expect(promptOf().user).toContain('lần thứ nhất');
  });

  it('invalid letter language falls back to the app language; jd-row language is ignored', async () => {
    generateContent.mockResolvedValue(reply(VI_OK));
    state.docs = docs({ letter: LETTER('fr') });
    expect((await call()).body).toMatchObject({ language: 'vi' });
    state.docs = docs(); // jd row carries language 'en', no letter
    expect((await call()).body).toMatchObject({ language: 'vi' });
  });

  it('CV over the size cap → 422', async () => {
    const big = { ...PARSED_CV, personal_information: { ...PARSED_CV.personal_information, summary: 'x '.repeat(60_000) } };
    state.docs = { data: [{ document_type: 'cv', content: { parsedCV: big }, language: null }, ...docs().data.slice(1)], error: null };
    expect(await call()).toEqual({ status: 422, body: { error: 'Snapshot unavailable' } });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('applications / documents query error → 503, no Gemini, no log row', async () => {
    state.app = { data: null, error: { message: 'boom' } };
    expect((await call()).status).toBe(503);
    state.app = { data: { id: APP_ID, status: 'applied', language: 'vi', company_name: null, role_title: null }, error: null };
    state.docs = { data: null, error: { message: 'boom' } };
    expect((await call()).status).toBe(503);
    expect(generateContent).not.toHaveBeenCalled();
    expect(state.inserts).toHaveLength(0);
  });

  it('selects only document_type, content and the letter language alias', async () => {
    generateContent.mockResolvedValue(reply(EN_OK));
    await call();
    expect(state.selects.application_documents).toBe('document_type, content, language:metadata->>language');
  });

  it('budget exhausted after context load → 504 with a follow_up error row', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      state.onApp = () => { vi.setSystemTime(Date.now() + 60_000); };
      const res = await call();
      expect(res.status).toBe(504);
      expect(generateContent).not.toHaveBeenCalled();
      expect(lastRow()).toMatchObject({ status: 'error', error_message: '[follow_up:request_budget_exhausted]', guard_metrics: { followUp: { outcome: 'error' } } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('no cover letter → still 200', async () => {
    generateContent.mockResolvedValue(reply(VI_OK));
    const res = await call();
    expect(res.status).toBe(200);
    expect(promptOf().user).not.toContain('PREVIOUS COVER LETTER');
  });

  it('language: letter en + app vi → EN; no letter + app vi → VI; override en over letter vi → EN', async () => {
    generateContent.mockResolvedValue(reply(EN_OK));
    state.docs = docs({ letter: LETTER('en') });
    expect((await call()).body).toMatchObject({ language: 'en' });
    expect(promptOf(0).system).toContain('Written entirely in English');
    generateContent.mockReset();
    generateContent.mockResolvedValue(reply(VI_OK));
    state.docs = docs();
    expect((await call()).body).toMatchObject({ language: 'vi' });
    expect(promptOf(0).system).toContain('Written entirely in Vietnamese');
    generateContent.mockReset();
    generateContent.mockResolvedValue(reply(EN_OK));
    state.docs = docs({ letter: LETTER('vi') });
    expect((await call({ language: 'en' })).body).toMatchObject({ language: 'en' });
    expect(promptOf(0).system).toContain('Written entirely in English');
  });

  it('success: kind rewrite log with followUp metrics; only one insert, no rpc or tracker writes', async () => {
    generateContent.mockResolvedValue(reply(EN_OK));
    const res = await call({ language: 'en' });
    expect(res).toEqual({ status: 200, body: { content: EN_OK, language: 'en' } });
    expect(lastRow()).toMatchObject({ kind: 'rewrite', status: 'success', guard_metrics: { v: 1, followUp: { outcome: 'valid' } } });
    expect(state.inserts).toHaveLength(1);
    expect(state.mutations).toEqual([]);
  });

  it('fidelity fallback → empty content + flag, logged as fallback', async () => {
    const bad = EN_OK + ' I also use Kubernetes daily.';
    generateContent.mockResolvedValue(reply(bad));
    const res = await call({ language: 'en' });
    expect(res).toEqual({ status: 200, body: { content: '', language: 'en', fidelityFallback: true } });
    expect(lastRow().guard_metrics).toMatchObject({ followUp: { outcome: 'fallback' } });
  });

  it('Gemini error → 500 generic, error row marked follow_up', async () => {
    generateContent.mockRejectedValue(new Error('PROVIDER_RAW_DETAIL'));
    const res = await call();
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('PROVIDER_RAW_DETAIL');
    expect(lastRow()).toMatchObject({
      status: 'error', kind: 'rewrite', error_message: '[follow_up:gemini_error]',
      guard_metrics: { followUp: { outcome: 'error', category: 'gemini_error' } },
    });
  });

  it('timeout → 504 retryable', async () => {
    generateContent.mockRejectedValue(new Error('upstream (Timeout)'));
    const res = await call();
    expect(res.status).toBe(504);
    expect(res.body).toMatchObject({ retryable: true });
  });

  it('no CV/JD/letter/draft text reaches any console call', async () => {
    state.docs = docs({ letter: LETTER('en') });
    generateContent.mockResolvedValue(reply(EN_OK + ' I also use Kubernetes daily.'));
    await call({ language: 'en' });
    generateContent.mockRejectedValue(new Error('SNAPSHOT_CV_SENTINEL SNAPSHOT_JD_SENTINEL Previous letter'));
    await call();
    const logged = (['info', 'warn', 'error', 'log'] as const)
      .flatMap((m) => (console[m] as unknown as { mock?: { calls: unknown[][] } }).mock?.calls ?? [])
      .map((a) => JSON.stringify(a)).join('\n');
    for (const s of ['SNAPSHOT_CV_SENTINEL', 'SNAPSHOT_JD_SENTINEL', 'Previous letter', 'Kubernetes', 'Dear Hiring Team']) expect(logged).not.toContain(s);
  });
});
