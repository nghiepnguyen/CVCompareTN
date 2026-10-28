import { describe, it, expect } from 'vitest';
import { dropUnsupportedSuggestions } from '../../../_server-lib/ai/suggestionGuard';

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
