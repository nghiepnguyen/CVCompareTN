// A2.1 HELD-OUT fixtures — SYNTHETIC ONLY, frozen in A2-P before any A2.0
// output exists. Never shown to the rubric during A2.0 and never edited after
// A2.0 results are seen. Run order is the frozen priority order: if the
// remaining cumulative budget only allows k fixtures, A2.1 runs the first k
// (no cherry-picking). Labels are author drafts pending owner review.
import type { A2Fixture } from './a2Fixtures';

export const A21_FIXTURES: A2Fixture[] = [
  {
    id: 'a21-weak',
    purpose: 'Weak fit: different discipline, almost no required evidence',
    jd: `Machine Learning Engineer
Requirements:
- 3+ years building ML models in production
- Python
- PyTorch or TensorFlow
- MLOps (model deployment and monitoring)
Nice to have:
- Spark`,
    cv: `Thu Nguyen (synthetic) — Customer Support Lead
Experience: Support Lead, Example Telecom, 02/2019 – Present
- Led a team of 6 support agents handling 300 tickets per day
- Wrote weekly reports in Excel on ticket volumes
Skills: Excel, Zendesk, customer communication`,
    expected: {
      band: 'Low',
      requirements: {
        '3+ years building ML models in production': { status: 'missing', priority: 'required' },
        Python: { status: 'missing', priority: 'required' },
        'PyTorch or TensorFlow': { status: 'missing', priority: 'required' },
        'MLOps (model deployment and monitoring)': { status: 'missing', priority: 'required' },
        Spark: { status: 'missing', priority: 'nice-to-have' },
      },
    },
  },
  {
    id: 'a21-career-transition',
    purpose: 'Career transition with transferable skills; Vietnamese CV, English JD',
    jd: `Instructional Designer
Requirements:
- Designing training curricula
- E-learning authoring tools such as Articulate Storyline
- Stakeholder communication
- 2+ years of instructional design or teaching experience
Nice to have:
- LMS administration`,
    cv: `Phuong Vo (synthetic) — Giáo viên tiếng Anh
Kinh nghiệm: Giáo viên, Example High School, 09/2018 – nay
- Thiết kế giáo án và chương trình học cho 4 khối lớp
- Phối hợp với phụ huynh và ban giám hiệu về kết quả học tập
- Tạo bài giảng trực tuyến trên Google Classroom trong năm 2021
Học vấn: Cử nhân Sư phạm tiếng Anh, Example University, 2018`,
    expected: {
      band: 'Medium',
      requirements: {
        'Designing training curricula': { status: 'matched', priority: 'required' },
        'E-learning authoring tools such as Articulate Storyline': { status: 'missing', priority: 'required' },
        'Stakeholder communication': { status: 'matched', priority: 'required' },
        '2+ years of instructional design or teaching experience': { status: 'matched', priority: 'required' },
        'LMS administration': { status: 'partial', priority: 'nice-to-have' },
      },
    },
  },
  {
    id: 'a21-seniority-mismatch',
    purpose: 'Seniority mismatch: right skills, years well below the requirement',
    jd: `Senior Product Manager
Requirements:
- 7+ years of product management experience
- Roadmap ownership for a B2B product
- Data-driven prioritisation using SQL or analytics tools
- Leading cross-functional teams`,
    cv: `Khanh Bui (synthetic) — Product Manager
Experience: Product Manager, Example SaaS, 01/2023 – Present (3 years of product management experience)
- Owned the quarterly roadmap for the B2B invoicing product
- Prioritised features using SQL queries on usage data
- Ran sprint planning with 5 engineers and 1 designer`,
    expected: {
      band: 'Medium',
      requirements: {
        '7+ years of product management experience': { status: 'partial', priority: 'required' },
        'Roadmap ownership for a B2B product': { status: 'matched', priority: 'required' },
        'Data-driven prioritisation using SQL or analytics tools': { status: 'matched', priority: 'required' },
        'Leading cross-functional teams': { status: 'partial', priority: 'required' },
      },
    },
  },
  {
    id: 'a21-vi-vi',
    purpose: 'Vietnamese JD + Vietnamese CV, moderate fit',
    jd: `Nhân viên Marketing
Yêu cầu:
- 2 năm kinh nghiệm marketing số
- Chạy quảng cáo Facebook Ads hoặc Google Ads
- Viết nội dung cho mạng xã hội
- Phân tích số liệu bằng Google Analytics
Ưu tiên:
- Biết thiết kế cơ bản bằng Canva`,
    cv: `Ngoc Tran (synthetic) — Nhân viên Marketing
Kinh nghiệm: Chuyên viên nội dung, Example Fashion, 03/2023 – nay
- Viết bài đăng Facebook và Instagram hằng tuần cho thương hiệu
- Thiết kế ảnh quảng cáo bằng Canva
- Hỗ trợ đồng nghiệp lên chiến dịch Facebook Ads
Kỹ năng: Canva, viết nội dung`,
    expected: {
      band: 'Medium',
      requirements: {
        '2 năm kinh nghiệm marketing số': { status: 'matched', priority: 'required' },
        'Chạy quảng cáo Facebook Ads hoặc Google Ads': { status: 'partial', priority: 'required' },
        'Viết nội dung cho mạng xã hội': { status: 'matched', priority: 'required' },
        'Phân tích số liệu bằng Google Analytics': { status: 'missing', priority: 'required' },
        'Biết thiết kế cơ bản bằng Canva': { status: 'matched', priority: 'nice-to-have' },
      },
    },
  },
  {
    id: 'a21-keyword-stuffed',
    purpose: 'Moderate CV whose skills line repeats every JD term without supporting experience',
    jd: `Data Engineer
Requirements:
- Python
- Apache Airflow
- Snowflake or BigQuery
- Building ETL pipelines
Nice to have:
- Kafka`,
    cv: `Long Phan (synthetic) — Data Analyst
Experience: Data Analyst, Example Insurance, 05/2021 – Present
- Wrote Python scripts to clean monthly claims data
- Built SQL reports for the finance team
Skills: Python, Apache Airflow, Airflow, Snowflake, BigQuery, ETL, ETL pipelines, Kafka, Spark, dbt`,
    expected: {
      band: 'Medium',
      requirements: {
        Python: { status: 'matched', priority: 'required' },
        'Apache Airflow': { status: 'partial', priority: 'required' },
        'Snowflake or BigQuery': { status: 'partial', priority: 'required' },
        'Building ETL pipelines': { status: 'partial', priority: 'required' },
        Kafka: { status: 'partial', priority: 'nice-to-have' },
      },
    },
  },
  {
    id: 'a21-long',
    purpose: 'Long JD and long CV (input-size stress), strong fit',
    jd: `Full-stack Engineer
About us: Example Travel builds booking software used by small hotels across Southeast Asia. ${'We value ownership, clear writing and careful testing. '.repeat(12)}
Requirements:
- 4+ years of full-stack development
- TypeScript on both frontend and backend
- React
- Node.js
- PostgreSQL
- Writing automated tests
Nice to have:
- AWS
- GraphQL`,
    cv: `Duc Ho (synthetic) — Full-stack Engineer
Experience: Full-stack Engineer, Example Booking Co., 01/2020 – Present
${Array.from({ length: 12 }, (_, i) => `- Delivered booking feature ${i + 1} end to end with React and a Node.js API written in TypeScript, backed by PostgreSQL, with unit and integration tests`).join('\n')}
- Deployed services on AWS ECS
Education: BSc Software Engineering, Example University, 2019`,
    expected: {
      band: 'High',
      requirements: {
        '4+ years of full-stack development': { status: 'matched', priority: 'required' },
        'TypeScript on both frontend and backend': { status: 'matched', priority: 'required' },
        React: { status: 'matched', priority: 'required' },
        'Node.js': { status: 'matched', priority: 'required' },
        PostgreSQL: { status: 'matched', priority: 'required' },
        'Writing automated tests': { status: 'matched', priority: 'required' },
        AWS: { status: 'matched', priority: 'nice-to-have' },
        GraphQL: { status: 'missing', priority: 'nice-to-have' },
      },
    },
  },
];
