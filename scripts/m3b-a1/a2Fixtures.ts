// A2.0 pilot fixtures — SYNTHETIC ONLY. Invented people/companies; no real CV,
// JD or user data. Expected labels are the author's draft and must be reviewed
// and signed by the owner BEFORE any run (protocol §3). They are frozen with
// the runner manifest; editing them after a run invalidates that run as validation.
export interface A2Fixture {
  id: string;
  purpose: string;
  jd: string;
  cv: string;
  expected: {
    band: 'High' | 'Medium' | 'Low' | 'boundary-80' | 'boundary-60';
    /** Requirement → expected status (human draft). */
    requirements: Record<string, { status: 'matched' | 'partial' | 'missing'; priority: 'required' | 'nice-to-have' }>;
  };
}

export const A2_FIXTURES: A2Fixture[] = [
  {
    id: 'a2-strong',
    purpose: 'Strong-fit control',
    jd: `Backend Engineer (Python)
Requirements:
- 3+ years of backend development with Python
- PostgreSQL
- REST API design
- Docker
Nice to have:
- Kubernetes`,
    cv: `Minh Tran (synthetic) — Backend Engineer
Experience: Backend Engineer, Example Logistics Co., 01/2020 – Present
- Built REST APIs in Python (FastAPI) serving the shipment tracking app
- Designed PostgreSQL schemas and query optimisations for order data
- Containerised all services with Docker and docker-compose
- Deployed services to a Kubernetes cluster with Helm charts
Education: BSc Computer Science, Example University, 2019`,
    expected: {
      band: 'High',
      requirements: {
        '3+ years of backend development with Python': { status: 'matched', priority: 'required' },
        PostgreSQL: { status: 'matched', priority: 'required' },
        'REST API design': { status: 'matched', priority: 'required' },
        Docker: { status: 'matched', priority: 'required' },
        Kubernetes: { status: 'matched', priority: 'nice-to-have' },
      },
    },
  },
  {
    id: 'a2-boundary-80',
    purpose: 'P2A.2-like score-80 boundary: borderline required row + missing preferred tools',
    jd: `Frontend Developer
Requirements:
- 3+ years of frontend development
- React and TypeScript
- Figma handoff
- Building reusable UI component libraries
- Collaboration with designers and backend engineers
Nice to have:
- Next.js
- Jest`,
    cv: `Lan Pham (synthetic) — Frontend Developer
Experience: Frontend Developer, Example Retail JSC, 01/2021 – Present
- Built the checkout single-page app in React and TypeScript
- Implemented screens from Figma designs handed off by the design team
- Maintained shared button and form components used across two apps
- Worked daily with designers and the API team on feature delivery
Education: BSc Information Technology, Example University, 2020`,
    expected: {
      band: 'boundary-80',
      requirements: {
        '3+ years of frontend development': { status: 'matched', priority: 'required' },
        React: { status: 'matched', priority: 'required' },
        TypeScript: { status: 'matched', priority: 'required' },
        'Figma handoff': { status: 'matched', priority: 'required' },
        'Building reusable UI component libraries': { status: 'partial', priority: 'required' },
        'Collaboration with designers and backend engineers': { status: 'matched', priority: 'required' },
        'Next.js': { status: 'missing', priority: 'nice-to-have' },
        Jest: { status: 'missing', priority: 'nice-to-have' },
      },
    },
  },
  {
    id: 'a2-boundary-60',
    purpose: 'Score-60 boundary: half the required items evidenced (Vietnamese CV, English JD)',
    jd: `Data Analyst
Requirements:
- SQL
- Tableau or Power BI
- 2+ years of data analysis experience
- Python for data analysis
- A/B testing
Nice to have:
- dbt`,
    cv: `Hoa Le (synthetic) — Chuyên viên phân tích dữ liệu
Kinh nghiệm: Chuyên viên phân tích, Example Bank, 06/2025 – nay
- Viết truy vấn SQL để tổng hợp báo cáo doanh số hàng tuần
- Xây dựng dashboard Power BI cho phòng kinh doanh
- Viết các model dbt cho kho dữ liệu bán hàng
- Hỗ trợ nhóm sản phẩm đọc kết quả thử nghiệm giao diện
Kỹ năng: Excel, SQL, Power BI, dbt
Học vấn: Cử nhân Kinh tế, Example University, 2025`,
    expected: {
      band: 'boundary-60',
      requirements: {
        SQL: { status: 'matched', priority: 'required' },
        'Tableau or Power BI': { status: 'matched', priority: 'required' },
        '2+ years of data analysis experience': { status: 'partial', priority: 'required' },
        'Python for data analysis': { status: 'missing', priority: 'required' },
        'A/B testing': { status: 'partial', priority: 'required' },
        dbt: { status: 'matched', priority: 'nice-to-have' },
      },
    },
  },
  {
    id: 'a2-semantic-stress',
    purpose: 'Alternatives, duplicates and ambiguous evidence; keyword-padded skills line',
    jd: `DevOps Engineer
Requirements:
- AWS, Azure or GCP
- Terraform
- CI/CD pipelines
- Kubernetes (K8s)
- Linux administration
Nice to have:
- Ansible
Keywords: Agile, Scrum, SRE`,
    cv: `Quan Do (synthetic) — Systems Engineer
Experience: Systems Engineer, Example Media, 03/2022 – Present
- Administered Ubuntu Linux servers for the video platform
- Maintained GitLab CI pipelines that build and test services
- Helped the team migrate some services to Google Cloud
Skills: AWS, Azure, GCP, Terraform, Kubernetes, K8s, Ansible, Agile, Scrum, SRE`,
    expected: {
      band: 'Medium',
      requirements: {
        'AWS, Azure or GCP': { status: 'matched', priority: 'required' },
        Terraform: { status: 'partial', priority: 'required' },
        'CI/CD pipelines': { status: 'matched', priority: 'required' },
        'Kubernetes (K8s)': { status: 'partial', priority: 'required' },
        'Linux administration': { status: 'matched', priority: 'required' },
        Ansible: { status: 'partial', priority: 'nice-to-have' },
      },
    },
  },
];
