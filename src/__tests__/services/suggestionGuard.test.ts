import { describe, it, expect } from 'vitest';
import { deniedConcepts, dropUnsupportedSuggestions } from '../../../_server-lib/ai/suggestionGuard';

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
    expect(r.drops).toEqual([expect.objectContaining({ reason: 'jd-only-concept', status: 'missing', section: 'Work Experience' })]);
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
    const kept = dropUnsupportedSuggestions([sug('Tracked north-star metrics.')], undefined, [{ concept: 'north-star', status: 'missing' }]);
    expect(kept).toHaveLength(1);
  });

  it('F/G: numeric and Skills rules still run first', () => {
    const drops: { reason: string }[] = [];
    dropUnsupportedSuggestions([{ ...sug('x'), section: 'Skills' }, sug('Cut cost by 40%.')], CV_EN, [], (d) => drops.push(d));
    expect(drops.map((d) => d.reason)).toEqual(['skills-section', 'unsupported-number']);
  });
});
