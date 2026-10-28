import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThinkingLevel } from '@google/genai';
import {
  GEMINI_ANALYZE_MODEL,
  GEMINI_PARSE_MODEL,
  GEMINI_REWRITE_MODEL,
  thinkingConfigFor,
  extractTokenUsage,
} from '../../../_server-lib/ai/geminiClient';
import {
  buildRewritePromptVi,
  buildRewritePromptEn,
  repairEscapedNewlines,
  normalizeHeadingDates,
} from '../../../_server-lib/ai/rewriteService';
import { GEMINI_PRICING } from '../../lib/geminiModels';

const insertMock = vi.fn().mockResolvedValue({ error: null });
vi.mock('../../../_server-lib/payment/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({ from: () => ({ insert: insertMock }) }),
}));

import { logAnalysisAttempt } from '../../../_server-lib/analysisLog';

describe('Gemini model routing', () => {
  it('routes analyze and rewrite to preview, parse to flash-lite', () => {
    expect(GEMINI_ANALYZE_MODEL).toBe('gemini-3-flash-preview');
    expect(GEMINI_PARSE_MODEL).toBe('gemini-3.5-flash-lite');
    expect(GEMINI_REWRITE_MODEL).toBe('gemini-3-flash-preview');
  });

  it('uses thinkingBudget for preview and thinkingLevel LOW for flash-lite', () => {
    expect(thinkingConfigFor('gemini-3-flash-preview')).toEqual({ thinkingBudget: 1024 });
    expect(thinkingConfigFor('gemini-3.5-flash-lite')).toEqual({ thinkingLevel: ThinkingLevel.LOW });
  });

  it('has a price for every routed model', () => {
    for (const m of [GEMINI_ANALYZE_MODEL, GEMINI_PARSE_MODEL, GEMINI_REWRITE_MODEL]) {
      expect(GEMINI_PRICING[m]).toBeDefined();
    }
  });
});

describe('extractTokenUsage', () => {
  it('bills thinking tokens as output, once', () => {
    expect(
      extractTokenUsage({ promptTokenCount: 100, candidatesTokenCount: 40, thoughtsTokenCount: 60 })
    ).toEqual({ inputTokens: 100, outputTokens: 100 });
  });

  it('treats missing thoughtsTokenCount as zero', () => {
    expect(extractTokenUsage({ promptTokenCount: 100, candidatesTokenCount: 40 })).toEqual({
      inputTokens: 100,
      outputTokens: 40,
    });
    expect(extractTokenUsage(undefined)).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});

describe('logAnalysisAttempt', () => {
  beforeEach(() => insertMock.mockClear());

  it('records model and latency_ms for a completed call', async () => {
    await logAnalysisAttempt('u1', 'success', 'parse_cv', undefined, {
      inputTokens: 10,
      outputTokens: 20,
      model: 'gemini-3.5-flash-lite',
      latencyMs: 1234,
    });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'parse_cv', model: 'gemini-3.5-flash-lite', latency_ms: 1234, input_tokens: 10, output_tokens: 20 })
    );
  });

  it('writes nulls when no model ran', async () => {
    await logAnalysisAttempt(null, 'error', 'analyze', 'Missing cvData');
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ model: null, latency_ms: null }));
  });
});

describe('rewrite prompt guardrails', () => {
  const jd = '<!-- JD -->';
  for (const [name, build] of [
    ['vi', buildRewritePromptVi],
    ['en', buildRewritePromptEn],
  ] as const) {
    describe(name, () => {
      const p = build(jd);

      it('includes the JD', () => expect(p).toContain(jd));

      it('forbids invented metrics, JD-only skills and invented contact details', () => {
        const lower = p.toLowerCase();
        expect(lower).toMatch(name === 'vi' ? /không bịa/ : /do not invent/);
        expect(p).toMatch(/ROAS/);
        expect(lower).toMatch(name === 'vi' ? /chỉ có trong jd/ : /jd-only/);
        expect(lower).toMatch(/linkedin/);
        expect(p).toMatch(/\[Email\]/); // placeholder named as forbidden
      });

      it('keeps the output in the CV language, headings included', () => {
        expect(p).toContain('Kinh nghiệm làm việc');
        expect(p).toContain('Work Experience');
      });

      it('never shows the XYZ template for the model to copy', () => {
        expect(p).not.toMatch(/Accomplished \[X\]/);
        expect(p).not.toMatch(/Google XYZ/);
      });

      it('does not force invented months onto year-only dates', () => {
        expect(p).toMatch(/YYYY/);
        expect(p).not.toMatch(/Chuẩn hóa tất cả mốc thời gian|Standardize all dates/);
      });
    });
  }
});

describe('repairEscapedNewlines', () => {
  it('restores real newlines in a single-line double-escaped rewrite', () => {
    // Shape seen in the 2026-10-28 benchmark (preview, vi-short).
    const broken = '# TRẦN THỊ MINH ANH\\nEmail: a@example.com\\n\\n## Kinh nghiệm làm việc\\n- Item';
    expect(repairEscapedNewlines(broken)).toBe(
      '# TRẦN THỊ MINH ANH\nEmail: a@example.com\n\n## Kinh nghiệm làm việc\n- Item'
    );
    expect(repairEscapedNewlines('Experience\\r\\n- Item')).toBe('Experience\n- Item');
  });

  it('leaves well-formed Markdown untouched, even when it mentions \\n literally', () => {
    const ok = '# Name\n## Skills\n- printf("\\n") in C';
    expect(repairEscapedNewlines(ok)).toBe(ok);
    expect(repairEscapedNewlines('# Name')).toBe('# Name');
  });
});

describe('normalizeHeadingDates', () => {
  it('normalizes textual months on ### role lines only', () => {
    const md = '## Work Experience\n### Data Analyst II — Lumen Retail Group | Jan 2022 – Present\n- Joined in May 2022 and built dashboards.';
    expect(normalizeHeadingDates(md)).toBe(
      '## Work Experience\n### Data Analyst II — Lumen Retail Group | 01/2022 – Present\n- Joined in May 2022 and built dashboards.'
    );
  });

  it('keeps year-only headings as written', () => {
    const md = '### Cử nhân Marketing — Đại học Thương mại | 2018 - 2022';
    expect(normalizeHeadingDates(md)).toBe(md);
  });
});
