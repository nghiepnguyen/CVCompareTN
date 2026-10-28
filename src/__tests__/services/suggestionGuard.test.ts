import { describe, it, expect } from 'vitest';
import { canonicalToken, deniedConcepts, dropUnsupportedSuggestions, rawJdConcepts } from '../../../_server-lib/ai/suggestionGuard';

const CV = `NGUYỄN VĂN AN — Backend Developer
TÓM TẮT: 7 năm phát triển backend, chuyên Node.js và Java.
Công ty Cổ phần Ví Sao Mai (04/2023 - nay) — Senior Backend Engineer
- Xử lý 1,2 triệu giao dịch/ngày; giảm 35% số sự cố P1.
Startup Lịch Hẹn Nhanh (06/2016 - 06/2017) — Junior Developer`;

const s = (section: string, optimized: string) => ({ section, original: 'x', optimized, explanation: 'y' });

describe('dropUnsupportedSuggestions', () => {
  // Regression (analyze benchmark 2026-10-29): the CV states 7 years while its
  // dates add up to ~10; the model "corrected" the fact.
  it('drops a suggestion that replaces the stated years of experience', () => {
    const out = dropUnsupportedSuggestions(
      [s('Professional Summary', '9 năm phát triển backend, chuyên Node.js/TypeScript.'), s('Professional Summary', 'Hơn 10 năm kinh nghiệm backend.')],
      CV
    );
    expect(out).toEqual([]);
  });

  it('keeps suggestions whose numbers all come from the CV', () => {
    const keep = [
      s('Professional Summary', '7 năm kinh nghiệm phát triển backend với Node.js và Java.'),
      s('Work Experience', 'Thiết kế dịch vụ xử lý 1.2 triệu giao dịch mỗi ngày, giảm 35% sự cố P1.'),
      s('Work Experience', 'Senior Backend Engineer tại Ví Sao Mai từ 04/2023 đến 10/2026.'),
    ];
    expect(dropUnsupportedSuggestions(keep, CV)).toEqual(keep);
  });

  it('drops invented metrics', () => {
    expect(dropUnsupportedSuggestions([s('Work Experience', 'Đảm bảo uptime 99.9% và on-call 24/7.')], CV)).toEqual([]);
  });

  it('drops Skills-section rewrites in either language', () => {
    const out = dropUnsupportedSuggestions([s('Skills', 'Node.js, Java'), s('Kỹ năng', 'Node.js, SEO (cơ bản)'), s('Technical Skills', 'Java')], CV);
    expect(out).toEqual([]);
  });

  it('without CV text (inline PDF/image) only applies the Skills rule', () => {
    const out = dropUnsupportedSuggestions([s('Work Experience', 'Giảm 50% chi phí.'), s('Skills', 'Java')], undefined);
    expect(out).toEqual([s('Work Experience', 'Giảm 50% chi phí.')]);
  });
});

describe('deniedConcepts + concept guard', () => {
  const CV_EN = `SMOKE TESTER
Lumen Retail Group — Data Analyst II, Jan 2022 – Present
• Created Tableau dashboards used in weekly business reviews.
• Wrote SQL reports on delivery SLAs for 12 regional hubs.`;
  const item = (requirement: string, status: 'matched' | 'partial' | 'missing') => ({ requirement, status });
  const dc = (...items: ReturnType<typeof item>[]) => ({ skills: items, tools: [], experience: [], education: [], keywords: [] });
  const sug = (optimized: string) => ({ section: 'Work Experience', original: 'Created Tableau dashboards used in weekly business reviews.', optimized, explanation: '' });
  const run = (comparison: ReturnType<typeof dc>, optimized: string, cv = CV_EN) => {
    const drops: unknown[] = [];
    const kept = dropUnsupportedSuggestions([sug(optimized)], cv, deniedConcepts(comparison, [], cv), (d) => drops.push(d));
    return { kept: kept.length === 1, drops };
  };

  it('A: drops a rewrite that imports missing metric concepts', () => {
    const r = run(dc(item('Define north-star and guardrail metrics', 'missing')), 'Created Tableau dashboards to track north-star and guardrail metrics.');
    expect(r.kept).toBe(false);
    expect(r.drops).toEqual([expect.objectContaining({ reason: 'unsupported-jd-concept', source: 'analysis', status: 'missing', section: 'Work Experience' })]);
  });

  it('B: drops a rewrite that imports a missing specific phrase (hyphen/space variants match)', () => {
    expect(run(dc(item('Enable self-serve analytics', 'missing')), 'Built dashboards enabling self-serve analytics for leadership.').kept).toBe(false);
    expect(run(dc(item('Enable self-serve analytics', 'missing')), 'Built dashboards enabling self serve analytics.').kept).toBe(false);
  });

  it('C: generic words in a missing requirement never become deny tokens', () => {
    const comparison = dc(item('Strong stakeholder communication', 'missing'), item('Leadership', 'missing'), item('Analytics and metrics reporting', 'missing'));
    expect(deniedConcepts(comparison, [], CV_EN)).toEqual([]);
    expect(run(comparison, 'Presented weekly Tableau dashboards to stakeholders and leadership in business reviews.').kept).toBe(true);
  });

  it('D: partial mixed requirement denies only the unsupported named part', () => {
    const comparison = dc(item('SQL and BigQuery', 'partial'));
    expect(deniedConcepts(comparison, [], CV_EN).map((d) => d.concept)).toEqual(['BigQuery']);
    expect(run(comparison, 'Wrote SQL reports on delivery SLAs for 12 regional hubs.').kept).toBe(true);
    expect(run(comparison, 'Wrote SQL and BigQuery reports on delivery SLAs for 12 regional hubs.').kept).toBe(false);
  });

  it('partial requirements do not yield multi-word phrases', () => {
    expect(deniedConcepts(dc(item('Solid statistics including causal inference', 'partial')), [], CV_EN)).toEqual([]);
    expect(deniedConcepts(dc(item('Solid statistics including causal inference', 'missing')), [], CV_EN).map((d) => d.concept)).toContain('causal inference');
  });

  it('E: CV evidence overrides the model classification', () => {
    const cv = `${CV_EN}\n• Rolled out self-serve analytics in Looker.`;
    const comparison = dc(item('Enable self-serve analytics', 'missing'), item('Looker', 'partial'));
    expect(deniedConcepts(comparison, [], cv)).toEqual([]);
    expect(run(comparison, 'Rolled out self-serve analytics in Looker for weekly business reviews.', cv).kept).toBe(true);
  });

  it('extracts named tools from lists and quoted gap terms, never matched items', () => {
    const comparison = dc(item('Python (pandas, statsmodels)', 'partial'), item('Create Looker dashboards', 'missing'), item('Tableau', 'matched'));
    const concepts = deniedConcepts(comparison, [{ category: 'Tools', content: "CV chưa ghi rõ chuỗi 'Airflow'.", impact: 'Low' }], CV_EN).map((d) => d.concept);
    expect(concepts).toEqual(expect.arrayContaining(['statsmodels', 'Looker', 'Airflow']));
    expect(concepts).not.toContain('Tableau');
    // With Python and pandas in the CV only statsmodels stays denied from that requirement.
    const withPython = deniedConcepts(dc(item('Python (pandas, statsmodels)', 'partial')), [], `${CV_EN}\nAutomated reporting with Python (pandas).`);
    expect(withPython.map((d) => d.concept)).toEqual(['statsmodels']);
  });

  it('skips the concept check without CV text (inline PDF/image)', () => {
    const kept = dropUnsupportedSuggestions([sug('Tracked north-star metrics.')], undefined, [{ concept: 'north-star', source: 'analysis', status: 'missing' }]);
    expect(kept).toHaveLength(1);
  });

  it('F/G: numeric and Skills rules still run first', () => {
    const drops: { reason: string }[] = [];
    dropUnsupportedSuggestions([{ ...sug('x'), section: 'Skills' }, sug('Cut cost by 40%.')], CV_EN, [], (d) => drops.push(d));
    expect(drops.map((d) => d.reason)).toEqual(['skills-section', 'unsupported-number']);
  });
});

describe('rawJdConcepts (raw-JD narrow lexical guard)', () => {
  const CV = `SMOKE TESTER
Lumen Retail Group — Data Analyst II
• Created Tableau dashboards used in weekly business reviews.
• Built 40+ dbt models on Snowflake for Finance and Marketing teams.`;
  const sug = (optimized: string) => ({ section: 'Work Experience', original: 'Created Tableau dashboards used in weekly business reviews.', optimized, explanation: '' });
  const guard = (jd: string, optimized: string, cv = CV) => {
    const drops: Record<string, unknown>[] = [];
    const kept = dropUnsupportedSuggestions([sug(optimized)], cv, rawJdConcepts(jd, cv), (d) => drops.push(d));
    return { kept: kept.length === 1, drops };
  };

  it('A: catches a JD term the analysis never listed', () => {
    // No analysis-derived concepts at all: only the raw JD knows about self-serve.
    const r = guard('About the role: Enable self-serve dashboards for business teams.', 'Developed self-serve Tableau dashboards for weekly business reviews.');
    expect(r.kept).toBe(false);
    expect(r.drops).toEqual([expect.objectContaining({ reason: 'unsupported-jd-concept', concept: 'self-serve', source: 'raw-jd' })]);
    for (const optimized of ['…support self-serve analytics for leadership.', '…provide self serve reporting for Finance.']) {
      expect(guard('You will build self-serve dashboards.', optimized).kept).toBe(false);
    }
  });

  it('B: hyphen and space forms are equivalent', () => {
    expect(guard('Drive self-serve adoption.', 'Enabled self serve analytics for Finance.').kept).toBe(false);
    expect(guard('Define north star metrics.', 'Tracked north-star metrics.').kept).toBe(true); // "north star" (no hyphen) in JD is not extracted
  });

  it('C: CV evidence overrides the JD term', () => {
    const cv = `${CV}\n• Built self serve dashboards for Finance.`;
    expect(rawJdConcepts('Own self-serve dashboards.', cv)).toEqual([]);
    expect(guard('Own self-serve dashboards.', 'Built self-serve dashboards for Finance.', cv).kept).toBe(true);
  });

  it('D: generic JD vocabulary yields no deny concepts', () => {
    const jd = 'Strong leadership and stakeholders communication. Build analytics, metrics, dashboard and reporting for business performance, data strategy, customer insights and growth. Data-driven, fast-paced, full-time, hands-on.';
    expect(rawJdConcepts(jd, CV)).toEqual([]);
    expect(guard(jd, 'Built data-driven Tableau dashboards and reporting for business stakeholders and leadership.').kept).toBe(true);
  });

  it('extracts acronyms with 3+ chars or a digit, and mixed-case identifiers, skipping ambiguous/place acronyms', () => {
    const concepts = rawJdConcepts('Knowledge of PCI DSS, CQRS, GA4, ETL and BigQuery. Remote in APAC. AI and BI a plus.', CV).map((c) => c.concept);
    expect(concepts).toEqual(expect.arrayContaining(['PCI', 'DSS', 'CQRS', 'GA4', 'ETL', 'BigQuery']));
    expect(concepts).not.toEqual(expect.arrayContaining(['APAC']));
    expect(concepts).not.toContain('AI');
    expect(concepts).not.toContain('BI');
  });

  it('H: plain Capitalized words and all-caps headings are never scraped', () => {
    const jd = 'About The Role\nMarketing\nFinance\nLeadership\nRESPONSIBILITIES\nRequirements: Strong Communication With Business Teams.';
    expect(rawJdConcepts(jd, CV)).toEqual([]);
  });

  it('cross-functional coming only from the JD is treated as unsupported specificity (documented)', () => {
    expect(guard('Work with cross-functional teams.', 'Collaborated with cross-functional teams on reporting.').kept).toBe(false);
  });

  it('E: analysis-derived concepts keep working alongside raw-JD ones', () => {
    const dc = { skills: [{ requirement: 'Define north-star and guardrail metrics', status: 'missing' as const }], tools: [], experience: [], education: [], keywords: [] };
    const denied = [...deniedConcepts(dc, [], CV), ...rawJdConcepts('Define north-star and guardrail metrics.', CV)];
    const hit = (o: string) => dropUnsupportedSuggestions([sug(o)], CV, denied).length === 0;
    expect(hit('Tracked guardrail metrics in Tableau.')).toBe(true);
    expect(hit('Tracked north-star metrics in Tableau.')).toBe(true);
    // The analysis-derived entry comes first, so provenance stays "analysis" for duplicates.
    expect(denied.find((d) => d.concept === 'north-star')?.source).toBe('analysis');
  });
});

describe('analysis concept variants (single distinctive token + regular plurals)', () => {
  const CV = `SMOKE TESTER
Lumen Retail Group — Data Analyst II
• Created Tableau dashboards used in weekly business reviews.
• Analyzed 25 pricing experiments; one change lifted conversion 3.1%.`;
  const dc = (requirement: string, status: 'missing' | 'partial') => ({ skills: [{ requirement, status }], tools: [], experience: [], education: [], keywords: [] });
  const sug = (optimized: string) => ({ section: 'Work Experience', original: 'Created Tableau dashboards used in weekly business reviews.', optimized, explanation: '' });
  const guard = (requirement: string, status: 'missing' | 'partial', optimized: string, cv = CV) => {
    const drops: Record<string, unknown>[] = [];
    const kept = dropUnsupportedSuggestions([sug(optimized)], cv, deniedConcepts(dc(requirement, status), [], cv), (d) => drops.push(d));
    return { kept: kept.length === 1, drops };
  };

  // Regression (Stage 3.2d focused benchmark, en-jd-concept / UI vi r2).
  it('A: "guardrail metrics" missing blocks "operational guardrails", with analysis provenance', () => {
    const r = guard('North-star and guardrail metrics', 'missing', 'Created Tableau dashboards used in weekly business reviews to track performance and operational guardrails.');
    expect(r.kept).toBe(false);
    expect(r.drops).toEqual([
      expect.objectContaining({ concept: 'guardrail', derivedFrom: 'guardrail metrics', source: 'analysis', status: 'missing', matchedForm: 'guardrails' }),
    ]);
  });

  it('B: the exact singular is blocked too', () => {
    expect(guard('North-star and guardrail metrics', 'missing', 'Tracked a guardrail for conversion in Tableau.').kept).toBe(false);
  });

  it('C: a plural in the CV overrides the model classification', () => {
    const cv = `${CV}\n• Defined operational guardrails for reporting.`;
    expect(deniedConcepts(dc('North-star and guardrail metrics', 'missing'), [], cv).map((d) => d.concept)).not.toEqual(
      expect.arrayContaining(['guardrail', 'guardrail metrics'])
    );
    expect(guard('North-star and guardrail metrics', 'missing', 'Defined operational guardrail metrics for reporting.', cv).kept).toBe(true);
  });

  it('D: singular/plural count as the same lexical evidence', () => {
    expect(canonicalToken('analysts')).toBe(canonicalToken('analyst'));
    expect(canonicalToken('dashboards')).toBe('dashboard');
    expect(canonicalToken('metrics')).toBe('metric');
    expect(canonicalToken('guardrails')).toBe('guardrail');
    expect(canonicalToken('policies')).toBe('policy');
    // "junior analysts" is missing, but the CV says "Analyst": no deny from "analysts".
    const concepts = deniedConcepts(dc('Mentor junior analysts', 'missing'), [], CV).map((d) => d.concept);
    expect(concepts).not.toContain('analysts');
  });

  it('E: words ending in -ss/-us/-is and short or non-letter tokens are never stripped', () => {
    for (const w of ['analysis', 'business', 'process', 'status', 'aws', 'gas', 'node.js']) expect(canonicalToken(w)).toBe(w);
  });

  it('F: a phrase with two distinctive words stays whole', () => {
    const concepts = deniedConcepts(dc('Solid statistics including causal inference', 'missing'), [], CV).map((d) => d.concept);
    expect(concepts).toContain('causal inference');
    expect(concepts).not.toContain('causal');
    expect(concepts).not.toContain('inference');
    expect(guard('Solid statistics including causal inference', 'missing', 'Used statistical inference to read pricing experiments.').kept).toBe(true);
  });

  it('G: partial requirements get no single-token expansion', () => {
    expect(deniedConcepts(dc('Guardrail metrics and SQL', 'partial'), [], CV).map((d) => d.concept)).not.toContain('guardrail');
    expect(deniedConcepts(dc('SQL and BigQuery', 'partial'), [], `${CV}\nSQL`).map((d) => d.concept)).toEqual(['BigQuery']);
  });

  it('a generic-only phrase still yields nothing', () => {
    expect(deniedConcepts(dc('Strong stakeholder communication and leadership', 'missing'), [], CV)).toEqual([]);
  });
});
