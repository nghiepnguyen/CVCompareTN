import { describe, it, expect } from 'vitest';
import { cleanMarkdownForPremium } from '../../components/views/result/cvPremiumUtils';

// Shape of a hardened rewrite for a Vietnamese CV: Vietnamese (often
// all-caps) headings, year-only dates kept as YYYY.
const VI_REWRITE = `# TRẦN THỊ MINH ANH
minhanh.tran@example.com | 0901 234 567 | Hà Nội

## TÓM TẮT CHUYÊN MÔN
Nhân viên Marketing có kinh nghiệm triển khai Facebook Ads.

## KINH NGHIỆM LÀM VIỆC
### Nhân viên Marketing — Công ty TNHH Hoa Sen Media | 06/2022 - nay
- Triển khai quảng cáo Facebook Ads cho 5 thương hiệu.

## HỌC VẤN
### Cử nhân Marketing — Đại học Thương mại | 2018 - 2022

## KỸ NĂNG
- Facebook Ads, Canva

## NGOẠI NGỮ
- Tiếng Anh (TOEIC 650)`;

describe('cleanMarkdownForPremium', () => {
  it('moves name, contact, education, skills and languages to the sidebar for Vietnamese headings', () => {
    const out = cleanMarkdownForPremium(VI_REWRITE);
    expect(out.startsWith('## TÓM TẮT CHUYÊN MÔN')).toBe(true);
    expect(out).toContain('## KINH NGHIỆM LÀM VIỆC');
    expect(out).not.toMatch(/HỌC VẤN|KỸ NĂNG|NGOẠI NGỮ|minhanh\.tran/);
  });

  it('strips "Ngoại ngữ" and "Languages" sections in any case', () => {
    expect(cleanMarkdownForPremium('## Tóm tắt\nA\n\n## Ngoại ngữ\n- Tiếng Anh')).toBe('## Tóm tắt\nA');
    expect(cleanMarkdownForPremium('## Summary\nA\n\n## LANGUAGES\n- English')).toBe('## Summary\nA');
  });
});
