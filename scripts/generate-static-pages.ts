import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';

// Mirrors the SEO map in index.html's pre-hydration script (kept in sync manually
// since this runs in Node against the built HTML, not in the browser).
const DOMAIN = 'https://cvfit.pro';
const ASSETS = 'https://data.cvfit.pro';

type RouteSeo = {
  titleVi: string;
  titleEn: string;
  descVi: string;
  descEn: string;
  kwVi: string;
  kwEn: string;
};

const SEO: Record<string, RouteSeo> = {
  '/': {
    titleVi: 'cvFit - Phân Tích CV & So Khớp JD Bằng AI | Kiểm Tra ATS Miễn Phí',
    titleEn: 'cvFit - AI CV Analyzer & ATS Resume Checker | Match CV to Jobs Free',
    descVi: 'Tải CV lên, so sánh với JD bất kỳ. Nhận điểm tương thích ATS, phân tích kỹ năng còn thiếu, gợi ý tối ưu CV và dự đoán khả năng trúng tuyển. Miễn phí 100%.',
    descEn: 'Upload your CV, compare with any JD. Get ATS compatibility score, skill gap analysis, CV optimization tips & hiring probability. 100% free.',
    kwVi: 'phân tích CV, tối ưu CV, so sánh CV với JD, kiểm tra CV ATS, cvfit, công cụ so sánh CV, cải thiện CV cho ATS, AI phân tích CV',
    kwEn: 'CV analysis, CV optimization, CV vs JD comparison, ATS resume checker, AI CV analyzer, cvfit, resume scanner, ATS score, skill gap',
  },
  '/privacy': {
    titleVi: 'Chính Sách Bảo Mật | cvFit - Công Cụ Phân Tích CV',
    titleEn: 'Privacy Policy | cvFit - AI CV Analysis Tool',
    descVi: 'Chính sách bảo mật của cvFit — cách chúng tôi thu thập, sử dụng và bảo vệ dữ liệu cá nhân của bạn khi dùng công cụ phân tích CV.',
    descEn: 'cvFit Privacy Policy — how we collect, use and protect your personal data when using our AI CV analysis tool.',
    kwVi: 'chính sách bảo mật cvfit, bảo mật dữ liệu CV',
    kwEn: 'privacy policy cvfit, CV data privacy, data protection cvfit',
  },
  '/terms': {
    titleVi: 'Điều Khoản Dịch Vụ | cvFit - Công Cụ Phân Tích CV',
    titleEn: 'Terms of Service | cvFit - AI CV Analysis Tool',
    descVi: 'Điều khoản dịch vụ của cvFit — quy định sử dụng công cụ phân tích CV và so khớp JD bằng AI.',
    descEn: 'cvFit Terms of Service — rules for using our AI-powered CV analysis and JD matching tool.',
    kwVi: 'điều khoản dịch vụ cvfit, terms of service cvfit',
    kwEn: 'terms of service cvfit, terms and conditions cvfit',
  },
  '/support': {
    titleVi: 'Ủng Hộ Phát Triển | cvFit',
    titleEn: 'Support cvFit Development | cvFit',
    descVi: 'Ủng hộ cvFit phát triển — hỗ trợ tài chính để duy trì và phát triển công cụ phân tích CV miễn phí cho cộng đồng.',
    descEn: 'Support cvFit development — contribute financially to maintain and grow our free community CV analysis tool.',
    kwVi: 'ủng hộ cvfit, hỗ trợ phát triển cvfit, donate cvfit',
    kwEn: 'support cvfit development, donate cvfit, contribute cvfit',
  },
  '/upgrade': {
    titleVi: 'Nâng Cấp cvFit Pro | Mở Khóa Phân Tích CV Không Giới Hạn',
    titleEn: 'Upgrade to cvFit Pro | Unlimited CV Analysis & Premium Features',
    descVi: 'Nâng cấp lên cvFit Pro để mở khóa giới hạn phân tích CV, lưu trữ JD, xuất báo cáo và nhiều tính năng cao cấp.',
    descEn: 'Upgrade to cvFit Pro to unlock unlimited CV analyses, JD storage, report export, and premium features.',
    kwVi: 'nâng cấp cvfit pro, cvfit pro, mở khóa giới hạn cv, phân tích CV không giới hạn',
    kwEn: 'upgrade cvfit pro, cvfit pro, unlock CV limits, unlimited CV analysis',
  },
  '/about': {
    titleVi: 'Về Chúng Tôi | cvFit - Đội Ngũ & Sứ Mệnh',
    titleEn: 'About Us | cvFit - Team & Mission',
    descVi: 'Tìm hiểu về đội ngũ phát triển cvFit — công cụ phân tích CV và so khớp JD miễn phí dành cho người Việt. Sứ mệnh giúp mọi ứng viên có CV chuẩn ATS.',
    descEn: 'Learn about the cvFit team — a free CV analysis & JD matching tool for everyone. Our mission: help every candidate build an ATS-ready CV.',
    kwVi: 'về cvfit, đội ngũ cvfit, công cụ phân tích CV, sứ mệnh cvfit',
    kwEn: 'about cvfit, cvfit team, CV analysis tool, cvfit mission',
  },
};

const ROUTE_BREADCRUMB_NAME: Record<string, { vi: string; en: string }> = {
  '/privacy': { vi: 'Chính sách bảo mật', en: 'Privacy Policy' },
  '/terms': { vi: 'Điều khoản dịch vụ', en: 'Terms of Service' },
  '/support': { vi: 'Ủng hộ phát triển', en: 'Support' },
  '/upgrade': { vi: 'Nâng cấp Pro', en: 'Upgrade' },
  '/about': { vi: 'Về chúng tôi', en: 'About' },
};

const FAQ_VI = [
  { q: 'Dữ liệu của tôi có được bảo mật không?', a: 'Tuyệt đối bảo mật. Mọi tập tin bạn tải lên đều được mã hóa bằng giao thức SSL/TLS. Hệ thống sẽ tự động xóa vĩnh viễn dữ liệu của bạn sau 24 giờ kể từ khi phân tích xong. Chúng tôi cam kết không chia sẻ thông tin của bạn cho bất kỳ bên thứ ba nào khi chưa có sự cho phép.' },
  { q: 'Hệ thống hỗ trợ những định dạng file nào?', a: 'Công cụ hỗ trợ PDF (.pdf), Word (.docx) và file hình ảnh (JPG, PNG). Khuyến khích dùng PDF để AI phân tích chính xác nhất về bố cục và khả năng đọc của ATS.' },
  { q: 'Làm sao để biết CV của tôi đã chuẩn ATS chưa?', a: 'Sau khi quét, hệ thống sẽ trả về Báo cáo ATS chi tiết. CV được coi là chuẩn ATS khi đạt Matching Score trên 80%, không chứa yếu tố gây nhiễu Robot, và chứa đầy đủ từ khóa quan trọng từ JD.' },
  { q: 'Tôi có thể sử dụng công cụ này miễn phí không?', a: 'Có! Chúng tôi cung cấp phân tích chuyên sâu hoàn toàn miễn phí cho người dùng mới để bạn trải nghiệm sức mạnh của AI.' },
  { q: 'Điểm Matching Score có đảm bảo nhận được lịch phỏng vấn?', a: 'Matching Score cao giúp CV của bạn vượt qua các bộ lọc tự động và gây ấn tượng mạnh với nhà tuyển dụng. Tuy nhiên, việc nhận được lời mời phỏng vấn còn phụ thuộc vào thái độ và cách bạn thể hiện. Công cụ của chúng tôi đóng vai trò trợ lý đắc lực để đảm bảo hồ sơ của bạn luôn ở trạng thái hoàn hảo nhất.' },
];

const FAQ_EN = [
  { q: 'Is my data secure?', a: 'Absolutely. All uploaded files are encrypted via SSL/TLS. The system permanently deletes your data 24 hours after analysis. We never share your information with third parties without your permission.' },
  { q: 'What file formats are supported?', a: 'PDF (.pdf), Word (.docx), and images (JPG, PNG). We recommend PDF for the most accurate layout and ATS readability analysis.' },
  { q: 'How do I know if my CV is ATS-ready?', a: "After scanning, you'll receive a detailed ATS Report. Your CV is ATS-ready when it scores above 80%, contains no robot-confusing elements, and includes all key JD keywords." },
  { q: 'Can I use this tool for free?', a: 'Yes! We offer in-depth analysis completely free for new users to experience the power of AI.' },
  { q: 'Does a high Matching Score guarantee an interview?', a: 'A high Matching Score helps your CV pass automated filters and impress recruiters. However, getting an interview also depends on your attitude and presentation. Our tool ensures your profile is always in its best shape.' },
];

const HOWTO_STEPS_VI = [
  { name: 'Tải CV lên', text: 'Upload hồ sơ của bạn dưới dạng PDF hoặc Word.' },
  { name: 'Dán JD', text: 'Sao chép nội dung tuyển dụng từ công ty bạn muốn ứng tuyển.' },
  { name: 'AI Phân tích', text: 'Hệ thống so sánh hơn 50 tiêu chí giữa hồ sơ và yêu cầu.' },
  { name: 'Nhận báo cáo', text: 'Nhận kết quả đánh giá chi tiết và hướng dẫn tối ưu ngay lập tức.' },
];

const HOWTO_STEPS_EN = [
  { name: 'Upload CV', text: 'Upload your profile in PDF or Word format.' },
  { name: 'Paste JD', text: 'Copy the job description from the company you want to apply to.' },
  { name: 'AI Analysis', text: 'System compares over 50 criteria between your CV and the requirements.' },
  { name: 'Get Report', text: 'Receive detailed evaluation results and optimization guidance instantly.' },
];

function buildSchemaGraph(subPath: string, lang: 'vi' | 'en', desc: string) {
  const canonical = `${DOMAIN}/${lang}${subPath === '/' ? '/' : subPath}`;

  const graph: Record<string, unknown>[] = [
    {
      '@type': 'SoftwareApplication',
      name: 'cvFit',
      description: desc,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: DOMAIN,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: lang === 'vi' ? 'VND' : 'USD',
      },
    },
    {
      '@type': 'Organization',
      name: 'cvFit',
      url: DOMAIN,
      logo: `${ASSETS}/android-chrome-192x192.png`,
    },
    {
      '@type': 'WebSite',
      '@id': `${DOMAIN}/#website`,
      name: 'cvFit',
      url: DOMAIN,
      inLanguage: lang === 'vi' ? 'vi-VN' : 'en-US',
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: lang === 'vi' ? 'Trang chủ' : 'Home', item: `${DOMAIN}/${lang}` },
      ],
    },
  ];

  const breadcrumbNames = ROUTE_BREADCRUMB_NAME[subPath];
  if (breadcrumbNames) {
    (graph[3].itemListElement as unknown[]).push({
      '@type': 'ListItem',
      position: 2,
      name: lang === 'vi' ? breadcrumbNames.vi : breadcrumbNames.en,
      item: canonical,
    });
  }

  if (subPath === '/') {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: (lang === 'vi' ? FAQ_VI : FAQ_EN).map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    });

    const steps = lang === 'vi' ? HOWTO_STEPS_VI : HOWTO_STEPS_EN;
    graph.push({
      '@type': 'HowTo',
      name: lang === 'vi' ? 'Cách sử dụng cvFit để phân tích CV' : 'How to use cvFit for CV analysis',
      description: lang === 'vi'
        ? '4 bước đơn giản để phân tích và tối ưu CV của bạn với AI.'
        : '4 simple steps to analyze and optimize your CV with AI.',
      step: steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s.name, text: s.text })),
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

function renderPage(template: string, subPath: string, lang: 'vi' | 'en'): string {
  const $ = cheerio.load(template);
  const route = SEO[subPath];
  const title = lang === 'vi' ? route.titleVi : route.titleEn;
  const desc = lang === 'vi' ? route.descVi : route.descEn;
  const kw = lang === 'vi' ? route.kwVi : route.kwEn;
  const canonical = `${DOMAIN}/${lang}${subPath === '/' ? '/' : subPath}`;

  $('html').attr('lang', lang);
  $('title').text(title);

  const setMeta = (selector: string, content: string) => {
    $(selector).attr('content', content);
  };

  setMeta('meta[name="description"]', desc);
  setMeta('meta[name="keywords"]', kw);
  setMeta('meta[name="robots"]', 'index, follow');
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', desc);
  setMeta('meta[property="og:url"]', canonical);
  setMeta('meta[property="og:locale"]', lang === 'vi' ? 'vi_VN' : 'en_US');
  setMeta('meta[name="twitter:title"]', title);
  setMeta('meta[name="twitter:description"]', desc);
  setMeta('meta[name="twitter:url"]', canonical);

  $('link[rel="canonical"]').attr('href', canonical);

  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const hl = $(el).attr('hreflang');
    const subForHreflang = subPath === '/' ? '/' : subPath;
    if (hl === 'vi') $(el).attr('href', `${DOMAIN}/vi${subForHreflang}`);
    else if (hl === 'en') $(el).attr('href', `${DOMAIN}/en${subForHreflang}`);
    else if (hl === 'x-default') $(el).attr('href', `${DOMAIN}/vi${subForHreflang}`);
  });

  $('script[type="application/ld+json"]').text(JSON.stringify(buildSchemaGraph(subPath, lang, desc), null, 2));

  return $.html();
}

function main() {
  const distDir = path.join(process.cwd(), 'dist');
  const templatePath = path.join(distDir, 'index.html');

  if (!fs.existsSync(templatePath)) {
    console.error(`[generate-static-pages] ${templatePath} not found — run "vite build" first.`);
    process.exit(1);
  }

  const template = fs.readFileSync(templatePath, 'utf-8');
  const routes = Object.keys(SEO);
  const langs: Array<'vi' | 'en'> = ['vi', 'en'];

  for (const subPath of routes) {
    for (const lang of langs) {
      const html = renderPage(template, subPath, lang);
      const outDir = subPath === '/' ? path.join(distDir, lang) : path.join(distDir, lang, subPath);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'index.html'), html);
      console.log(`[generate-static-pages] wrote ${path.relative(distDir, outDir)}/index.html`);
    }
  }
}

main();
