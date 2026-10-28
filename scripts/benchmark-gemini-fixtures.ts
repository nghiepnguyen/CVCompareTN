// Synthetic, fictional benchmark data for scripts/benchmark-gemini-parse-rewrite.ts.
// No real candidate data: names/companies are invented, emails use example.com.
// Not imported by any runtime code.

export type Truth = {
  name: string;
  email?: string;
  phone?: string;
  companies: string[];
  titles: string[];
  // Start years in CV order, used to check date extraction.
  startYears: number[];
  institutions: string[];
  gradYears: number[];
  skills: string[];
  certifications: string[];
  languages: string[];
};

export type Sample = {
  id: string;
  language: 'vi' | 'en';
  jd: string;
  // Exactly one of text / file is set.
  text?: string;
  file?: { path: string; mimeType: string };
  truth: Truth;
  // Distinctive JD keywords the rewrite should cover naturally.
  jdKeywords: string[];
  // JD requirements the CV gives no evidence for, even under a variant name
  // (hand-picked). Any output presenting these as the candidate's is a fabrication.
  jdOnlySkills?: string[];
};

const JD_VI_SHORT = `Vị trí: Chuyên viên Marketing Digital. Yêu cầu: 2+ năm chạy quảng cáo Facebook Ads, Google Ads; phân tích số liệu bằng Google Analytics 4; viết nội dung; ưu tiên biết SEO. Làm việc tại Hà Nội.`;

const JD_VI_LONG = `Vị trí: Senior Backend Engineer (Node.js) - Công ty Fintech, TP.HCM.
Mô tả: Thiết kế, phát triển và vận hành hệ thống thanh toán xử lý 5 triệu giao dịch/ngày. Làm việc với đội Product để xây dựng API mới, tối ưu hiệu năng cơ sở dữ liệu, dẫn dắt code review và mentor kỹ sư junior. Tham gia trực vận hành (on-call), xử lý sự cố production, viết tài liệu kỹ thuật và RFC.
Yêu cầu bắt buộc: 5+ năm kinh nghiệm backend; thành thạo Node.js/TypeScript, PostgreSQL, Redis; kinh nghiệm Kafka hoặc RabbitMQ; hiểu biết về microservices, Docker, Kubernetes; kinh nghiệm AWS hoặc GCP; viết unit/integration test; hiểu observability (Prometheus, Grafana, OpenTelemetry).
Ưu tiên: kiến thức bảo mật thanh toán (PCI DSS); từng làm hệ thống ví điện tử hoặc core banking; kinh nghiệm event sourcing/CQRS; tiếng Anh giao tiếp tốt.
Quyền lợi: Lương 50-70 triệu, thưởng tháng 13, bảo hiểm sức khỏe cao cấp, làm việc hybrid, ngân sách học tập 20 triệu/năm.`;

const JD_EN_LONG = `Senior Data Analyst — E-commerce Marketplace (Remote, APAC).
About the role: You will own analytics for the Growth team, partnering with Product, Marketing and Finance to measure experiments, forecast demand and build self-serve dashboards.
Responsibilities: design and analyze A/B tests; build and maintain dbt models on BigQuery; create Looker dashboards for weekly business reviews; define north-star and guardrail metrics; present insights to leadership; mentor junior analysts.
Requirements: 4+ years in analytics; expert SQL; Python (pandas, statsmodels); experience with dbt and a cloud warehouse (BigQuery, Snowflake or Redshift); solid statistics (hypothesis testing, regression, causal inference); stakeholder communication.
Nice to have: marketing attribution / MMM, Airflow, experience in marketplaces, Vietnamese or Bahasa language skills.`;

const JD_EN_SHORT = `Product Designer (UI/UX). Requirements: 3+ years designing web and mobile apps in Figma, building design systems, running usability testing and user research, prototyping, collaborating with engineers. Accessibility (WCAG) knowledge is a plus.`;

const CV_VI_SHORT = `TRẦN THỊ MINH ANH
Email: minhanh.tran@example.com | ĐT: 0901 234 567 | Hà Nội
MỤC TIÊU: Phát triển sự nghiệp trong lĩnh vực marketing số.
KINH NGHIỆM
Công ty TNHH Hoa Sen Media — Nhân viên Marketing (06/2022 - nay)
- Chạy quảng cáo Facebook Ads cho 5 thương hiệu mỹ phẩm, ngân sách 200 triệu/tháng.
- Viết bài fanpage, tăng lượt tương tác 40% trong 6 tháng.
Cửa hàng Mộc Trà — Thực tập sinh Marketing (01/2022 - 05/2022)
- Hỗ trợ chụp ảnh sản phẩm và đăng bài.
HỌC VẤN: Cử nhân Marketing, Đại học Thương mại (2018 - 2022)
KỸ NĂNG: Facebook Ads, Canva, Google Analytics, viết content
NGOẠI NGỮ: Tiếng Anh (TOEIC 650)`;

const CV_VI_LONG = `NGUYỄN VĂN AN — Backend Developer
Email: an.nguyen@example.com | 0900 000 111 | TP.HCM | linkedin.com/in/an-nguyen-demo
TÓM TẮT: 7 năm phát triển backend, chuyên Node.js và Java, từng xây dựng hệ thống thương mại điện tử và ví điện tử quy mô lớn.
KINH NGHIỆM LÀM VIỆC
1) Công ty Cổ phần Ví Sao Mai (04/2023 - nay) — Senior Backend Engineer
- Thiết kế dịch vụ đối soát giao dịch bằng Node.js/TypeScript, xử lý 1,2 triệu giao dịch/ngày.
- Áp dụng Kafka cho luồng sự kiện thanh toán; giảm độ trễ đối soát từ 4 giờ xuống 15 phút.
- Thiết lập giám sát bằng Prometheus và Grafana; giảm 35% số sự cố P1 trong năm 2024.
- Tham gia trực on-call, viết 6 RFC kỹ thuật.
2) Công ty TMĐT Lúa Vàng (03/2020 - 03/2023) — Backend Lead
- Dẫn dắt nhóm 6 người xây dựng dịch vụ đơn hàng bằng NestJS; chuyển monolith sang 12 microservices trên Kubernetes (GKE).
- Tích hợp RabbitMQ xử lý 800 nghìn đơn/ngày.
- Giảm p95 latency API từ 900ms xuống 180ms nhờ tối ưu index PostgreSQL và cache Redis.
- Mentor 3 kỹ sư junior, tổ chức code review hằng tuần.
3) Công ty Phần mềm Đông Phương (07/2017 - 02/2020) — Software Engineer
- Phát triển REST API bằng Java Spring Boot cho hệ thống quản lý kho.
- Viết unit test JUnit, độ phủ 75%.
- Tích hợp cổng thanh toán VNPay và MoMo; vận hành MySQL trên AWS RDS.
4) Startup Lịch Hẹn Nhanh (06/2016 - 06/2017) — Junior Developer
- Xây dựng backend Express.js cho ứng dụng đặt lịch; MongoDB; triển khai Docker trên AWS EC2.
HỌC VẤN
- Kỹ sư Khoa học Máy tính, Đại học Bách khoa TP.HCM (2012 - 2016), GPA 3.2/4.
KỸ NĂNG
- Ngôn ngữ: TypeScript, JavaScript, Java, SQL
- Framework: Node.js, NestJS, Express, Spring Boot
- Dữ liệu: PostgreSQL, MySQL, MongoDB, Redis, Kafka, RabbitMQ
- Hạ tầng: Docker, Kubernetes, GCP, AWS, GitHub Actions, Prometheus, Grafana
CHỨNG CHỈ
- AWS Certified Developer – Associate (2022)
- Certified Kubernetes Application Developer (CKAD) (2024)
NGOẠI NGỮ: Tiếng Anh — TOEIC 780; Tiếng Nhật — N4
DỰ ÁN CÁ NHÂN
- Hệ thống khuyến mãi realtime (flash sale 50 nghìn req/s) dùng Redis Lua script và rate limiting.
- Thư viện mã nguồn mở "vn-currency-format" (300 sao GitHub).
HOẠT ĐỘNG: Diễn giả tại sự kiện Vietnam Node.js Meetup 2024.`;

const CV_EN_MEDIUM = `PRIYA RAMAN
Data Analyst · Singapore · priya.raman@example.com · +65 8000 1234
PROFILE
Analyst with 5 years of experience turning marketplace data into decisions. Comfortable with SQL, Python and BI tools.
EXPERIENCE
Lumen Retail Group — Data Analyst II, Jan 2022 – Present
• Built 40+ dbt models on Snowflake powering finance and marketing reporting.
• Analyzed 25 pricing experiments; one change lifted conversion 3.1%.
• Created Tableau dashboards used in weekly business reviews.
• Onboarded and mentored 2 junior analysts.
Kestrel Logistics — Business Analyst, Aug 2019 – Dec 2021
• Wrote SQL reports on delivery SLAs for 12 regional hubs.
• Automated Excel reporting with Python (pandas), saving 10 hours/week.
EDUCATION
National University of Singapore — B.Sc. Statistics, 2019
SKILLS
SQL, Python (pandas, scikit-learn), dbt, Snowflake, Tableau, Excel, A/B testing, regression
CERTIFICATIONS
Tableau Desktop Specialist (2021)
LANGUAGES
English (native), Tamil (fluent), Bahasa Melayu (basic)`;

// Simulates a two-column template flattened by a text extractor: interleaved
// sidebar/body lines, pipes, inconsistent date formats, icon glyphs.
const CV_EN_COMPLEX = `■ CONTACT        ║ LUCAS OYELARAN-BERG
✉ lucas.ob@example.com ║ Senior Product Designer
☎ +44 7700 900123      ║
⌂ London, UK           ║ ABOUT ME
in/lucas-ob-demo        ║ Designer focused on complex B2B tools. 7 yrs. Loves design systems.
■ SKILLS               ║
Figma ★★★★★            ║ WORK HISTORY
Design Systems ★★★★☆   ║ Northwind Analytics | Senior Product Designer | 2021/03 — now
Prototyping ★★★★★      ║ ▸ Led redesign of reporting suite used by 2,000 enterprise clients
User Research ★★★★☆    ║ ▸ Built "Atlas" design system: 120 components, adopted by 4 squads
HTML/CSS ★★★☆☆         ║ ▸ Ran 30+ usability tests; task success +22%
■ LANGUAGES            ║ Brightline Studio | UX/UI Designer | Sept 2018 - Feb '21
English — Native       ║ ▸ Designed iOS/Android banking app for a regional bank
Yoruba — Conversational║ ▸ Introduced WCAG 2.1 AA audits into the release checklist
Swedish — B1           ║ Freelance | Visual Designer | 2017-2018
■ EDUCATION            ║ ▸ Branding & landing pages for 15 small businesses
MA Interaction Design  ║
Royal College of Art   ║ ■ CERTIFICATES
2017                   ║ Google UX Design Certificate (2020) · NN/g UX Certification (2022)
BA Graphic Design      ║
University of Leeds 2015║ ■ TOOLS: Figma, FigJam, Sketch, Maze, Hotjar, Jira`;

const FIXTURES = '.r2-migration/preview/fixtures';

// Realistic CVs with the contact line removed: checks whether a model invents contact details.
const CV_EN_NO_CONTACT = CV_EN_MEDIUM.replace(/^Data Analyst · .*$/m, 'Data Analyst');
const CV_VI_NO_CONTACT = CV_VI_SHORT.replace(/^Email: .*$/m, '');

export const SAMPLES: Sample[] = [
  {
    id: 'vi-short',
    language: 'vi',
    jd: JD_VI_SHORT,
    text: CV_VI_SHORT,
    truth: {
      name: 'Trần Thị Minh Anh',
      email: 'minhanh.tran@example.com',
      phone: '0901234567',
      companies: ['Hoa Sen Media', 'Mộc Trà'],
      titles: ['Marketing', 'Thực tập sinh'],
      startYears: [2022, 2022],
      institutions: ['Thương mại'],
      gradYears: [2022],
      skills: ['Facebook Ads', 'Canva', 'Google Analytics'],
      certifications: [],
      languages: ['Anh'],
    },
    jdKeywords: ['Facebook Ads', 'Google Ads', 'Google Analytics', 'SEO', 'nội dung'],
    jdOnlySkills: ['Google Ads', 'SEO'],
  },
  {
    id: 'vi-long',
    language: 'vi',
    jd: JD_VI_LONG,
    text: CV_VI_LONG,
    truth: {
      name: 'Nguyễn Văn An',
      email: 'an.nguyen@example.com',
      phone: '0900000111',
      companies: ['Ví Sao Mai', 'Lúa Vàng', 'Đông Phương', 'Lịch Hẹn Nhanh'],
      titles: ['Senior Backend', 'Backend Lead', 'Software Engineer', 'Junior'],
      startYears: [2023, 2020, 2017, 2016],
      institutions: ['Bách khoa'],
      gradYears: [2016],
      skills: ['Node.js', 'PostgreSQL', 'Redis', 'Kafka', 'Kubernetes', 'Spring Boot'],
      certifications: ['AWS', 'CKAD'],
      languages: ['Anh', 'Nhật'],
    },
    jdKeywords: ['Node.js', 'TypeScript', 'PostgreSQL', 'Redis', 'Kafka', 'Kubernetes', 'microservices', 'PCI DSS', 'OpenTelemetry'],
    jdOnlySkills: ['PCI DSS', 'OpenTelemetry', 'event sourcing', 'CQRS', 'core banking'],
  },
  {
    id: 'en-medium',
    language: 'en',
    jd: JD_EN_LONG,
    text: CV_EN_MEDIUM,
    truth: {
      name: 'Priya Raman',
      email: 'priya.raman@example.com',
      phone: '+6580001234',
      companies: ['Lumen Retail', 'Kestrel Logistics'],
      titles: ['Data Analyst', 'Business Analyst'],
      startYears: [2022, 2019],
      institutions: ['National University of Singapore'],
      gradYears: [2019],
      skills: ['SQL', 'Python', 'dbt', 'Snowflake', 'Tableau'],
      certifications: ['Tableau'],
      languages: ['English', 'Tamil', 'Melayu'],
    },
    jdKeywords: ['A/B test', 'dbt', 'BigQuery', 'Looker', 'SQL', 'Python', 'stakeholder', 'causal inference'],
    jdOnlySkills: ['BigQuery', 'Looker', 'causal inference', 'statsmodels', 'Airflow', 'attribution'],
  },
  {
    id: 'en-complex-layout',
    language: 'en',
    jd: JD_EN_SHORT,
    text: CV_EN_COMPLEX,
    truth: {
      name: 'Lucas Oyelaran-Berg',
      email: 'lucas.ob@example.com',
      phone: '+447700900123',
      companies: ['Northwind Analytics', 'Brightline Studio', 'Freelance'],
      titles: ['Senior Product Designer', 'UX/UI Designer', 'Visual Designer'],
      startYears: [2021, 2018, 2017],
      institutions: ['Royal College of Art', 'Leeds'],
      gradYears: [2017, 2015],
      skills: ['Figma', 'Design Systems', 'Prototyping', 'User Research'],
      certifications: ['Google UX', 'NN/g'],
      languages: ['English', 'Yoruba', 'Swedish'],
    },
    jdKeywords: ['Figma', 'design system', 'usability testing', 'user research', 'prototyp', 'WCAG'],
    jdOnlySkills: [],
  },
  {
    id: 'en-pdf-text',
    language: 'en',
    jd: 'Frontend Developer. Requirements: 3 years building React and TypeScript applications, accessible HTML/CSS, REST APIs, automated tests with Vitest, Git and performance optimization. Responsibilities: ship responsive interfaces, collaborate with designers and maintain reliable web applications.',
    file: { path: `${FIXTURES}/synthetic-text.pdf`, mimeType: 'application/pdf' },
    truth: {
      name: 'Synthetic Candidate',
      companies: ['Synthetic Demo Company'],
      titles: ['Frontend Developer'],
      startYears: [2023],
      institutions: ['Synthetic University'],
      gradYears: [2022],
      skills: ['React', 'TypeScript', 'Vitest'],
      certifications: [],
      languages: [],
    },
    jdKeywords: ['React', 'TypeScript', 'accessib', 'REST API', 'Vitest', 'performance'],
    jdOnlySkills: [],
  },
  {
    id: 'en-pdf-scan-inline',
    language: 'en',
    jd: 'Frontend Developer. Requirements: 3 years building React and TypeScript applications, accessible HTML/CSS, REST APIs, automated tests with Vitest, Git and performance optimization. Responsibilities: ship responsive interfaces, collaborate with designers and maintain reliable web applications.',
    file: { path: `${FIXTURES}/synthetic-scan.pdf`, mimeType: 'application/pdf' },
    // Ground truth not known in advance for the scanned fixture; quality is judged by reading.
    truth: {
      name: '',
      companies: [],
      titles: [],
      startYears: [],
      institutions: [],
      gradYears: [],
      skills: [],
      certifications: [],
      languages: [],
    },
    jdKeywords: ['React', 'TypeScript', 'accessib', 'REST API', 'Vitest', 'performance'],
    jdOnlySkills: [],
  },
];

const byId = (id: string) => SAMPLES.find((s) => s.id === id)!;
SAMPLES.push(
  {
    id: 'en-no-contact',
    language: 'en',
    jd: JD_EN_LONG,
    text: CV_EN_NO_CONTACT,
    truth: { ...byId('en-medium').truth, email: undefined, phone: undefined },
    jdKeywords: ['A/B test', 'dbt', 'BigQuery', 'Looker', 'SQL', 'Python', 'stakeholder', 'causal inference'],
    jdOnlySkills: ['BigQuery', 'Looker', 'causal inference', 'statsmodels', 'Airflow', 'attribution'],
  },
  {
    id: 'vi-no-contact',
    language: 'vi',
    jd: JD_VI_SHORT,
    text: CV_VI_NO_CONTACT,
    truth: { ...byId('vi-short').truth, email: undefined, phone: undefined },
    jdKeywords: ['Facebook Ads', 'Google Ads', 'Google Analytics', 'SEO', 'nội dung'],
    jdOnlySkills: ['Google Ads', 'SEO'],
  }
);
