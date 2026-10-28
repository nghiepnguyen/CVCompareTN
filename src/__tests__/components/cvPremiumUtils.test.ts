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

  // Regression (Stage 2 benchmark): with no contact details the model put a
  // summary bullet right under the H1. It is content, not contact.
  it('keeps a non-contact line in the contact slot instead of treating it as contact', () => {
    const md = '# PRIYA RAMAN\n\n- 5 years of experience turning marketplace data into decisions\n\n## Professional Summary\nAnalyst.';
    const out = cleanMarkdownForPremium(md);
    expect(out).toContain('- 5 years of experience turning marketplace data into decisions');
    expect(out).toContain('## Professional Summary');
  });

  it('strips real contact lines: email, phone, URL, LinkedIn', () => {
    for (const contact of [
      'priya.raman@example.com',
      '+65 8000 1234',
      '0901 234 567 | Hà Nội',
      'linkedin.com/in/priya-demo',
      'https://priya.dev',
      'Singapore · priya.raman@example.com · +65 8000 1234',
    ]) {
      expect(cleanMarkdownForPremium(`# Priya\n${contact}\n\n## Summary\nA`)).toBe('## Summary\nA');
    }
  });

  it('only looks for contact lines before the first section', () => {
    const md = '# Name\nname@example.com\n\n## Summary\nBuilt the checkout for shop.com, used by 0901 234 567 customers.';
    expect(cleanMarkdownForPremium(md)).toBe('## Summary\nBuilt the checkout for shop.com, used by 0901 234 567 customers.');
  });

  it('does not mistake a year range in the preamble for a phone number', () => {
    expect(cleanMarkdownForPremium('# Name\nData Analyst, 2018 - 2022\n\n## Summary\nA')).toBe('Data Analyst, 2018 - 2022\n\n## Summary\nA');
  });
});
