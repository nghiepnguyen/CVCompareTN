import { describe, it, expect } from 'vitest';
import { canonicalToken, dropUnsupportedSuggestions, rawJdConcepts } from '../../../_server-lib/ai/suggestionGuard';

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

});

describe('ship-safe guard: the analysis never filters suggestions', () => {
  const sug = (original: string, optimized: string, section = 'Work Experience') => ({ section, original, optimized, explanation: '' });
  const run = (jd: string, cv: string, optimized: string, original = 'x') => {
    const drops: Record<string, unknown>[] = [];
    const kept = dropUnsupportedSuggestions([sug(original, optimized)], cv, rawJdConcepts(jd, cv), (d) => drops.push(d));
    return { kept: kept.length === 1, drops };
  };

  // Regression (Stage 3.2e full benchmark): an analysis token "Nội" from
  // "Làm việc tại Hà Nội" deleted truthful "nội dung" rewrites.
  it('keeps "nội dung" when the JD names Hà Nội', () => {
    const jd = 'Vị trí: Chuyên viên Marketing Digital. Yêu cầu: 2+ năm chạy quảng cáo Facebook Ads. Làm việc tại Hà Nội.';
    const cv = 'Viết bài fanpage, tăng lượt tương tác 40% trong 6 tháng. Hỗ trợ chụp ảnh sản phẩm và đăng bài.';
    expect(rawJdConcepts(jd, cv).map((c) => c.concept)).not.toEqual(expect.arrayContaining(['Nội', 'Hà']));
    expect(run(jd, cv, 'Xây dựng kế hoạch nội dung và viết bài cho Fanpage, tăng tương tác 40% trong 6 tháng.').kept).toBe(true);
  });

  // Regression (Stage 3.2e full benchmark): "Observability" from a partial
  // requirement deleted a paraphrase of real Prometheus/Grafana monitoring.
  it('keeps an observability paraphrase backed by Prometheus/Grafana in the CV', () => {
    const jd = 'Yêu cầu: hiểu observability (Prometheus, Grafana, OpenTelemetry).';
    const cv = '- Giám sát hệ thống bằng Prometheus và Grafana; giảm 35% số sự cố P1 trong năm 2024.';
    expect(run(jd, cv, '- Thiết lập observability bằng Prometheus và Grafana, giảm 35% số sự cố P1 trong năm 2024.').kept).toBe(true);
    // The distinctive JD identifier the CV lacks is still guarded.
    expect(run(jd, cv, '- Thiết lập OpenTelemetry cùng Prometheus và Grafana.').kept).toBe(false);
  });

  it('a lowercase JD concept alone does not cause a drop (accepted false-negative debt)', () => {
    const jd = 'Define north star and guardrail metrics. Solid statistics including causal inference.';
    const cv = 'Created Tableau dashboards used in weekly business reviews.';
    expect(rawJdConcepts(jd, cv)).toEqual([]);
    expect(run(jd, cv, 'Created Tableau dashboards to track operational guardrails and causal inference.').kept).toBe(true);
  });

  it('raw-JD self-serve stays protected, with provenance', () => {
    const jd = 'About the role: build self-serve dashboards.';
    const cv = 'Created Tableau dashboards used in weekly business reviews.';
    const r = run(jd, cv, 'Developed self-serve Tableau dashboards for weekly business reviews.');
    expect(r.kept).toBe(false);
    expect(r.drops).toEqual([expect.objectContaining({ reason: 'unsupported-jd-concept', concept: 'self-serve', source: 'raw-jd' })]);
    expect(run(jd, `${cv}\nBuilt self serve dashboards for Finance.`, 'Built self-serve dashboards for Finance.').kept).toBe(true);
  });
});

describe('canonicalToken (lexical equivalence for CV override and matching)', () => {
  it('folds regular plurals', () => {
    expect(canonicalToken('analysts')).toBe(canonicalToken('analyst'));
    expect(canonicalToken('dashboards')).toBe('dashboard');
    expect(canonicalToken('policies')).toBe('policy');
  });

  it('never strips -ss/-us/-is endings, short or non-letter tokens', () => {
    for (const w of ['analysis', 'business', 'process', 'status', 'aws', 'gas', 'node.js']) expect(canonicalToken(w)).toBe(w);
  });
});
