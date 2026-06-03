/**
 * CvPremiumTemplate — Layout CV Premium cho cvFit Pro/Recruiter
 *
 * Cách dùng trong project:
 *   import CvPremiumTemplate from '@/components/cv/CvPremiumTemplate';
 *   <CvPremiumTemplate data={fullRewrittenCV} matchScore={91} plan="pro" />
 *
 * Props:
 *   data        — object CvData (xem type bên dưới)
 *   matchScore  — number 0-100
 *   matchedKw   — string[]   từ khóa khớp
 *   missingKw   — string[]   từ khóa thiếu
 *   plan        — 'pro' | 'recruiter'
 *   onPrint     — () => void
 *   onCopy      — (markdown: string) => void
 *   language    — 'vi' | 'en'
 */

import { useState, useRef, useMemo } from "react";

// ─── Màu token — dark industrial palette ────────────────────────────────────
const T = {
  bg:          "#060709",
  surface:     "#0c0e13",
  surfaceAlt:  "#090b10",
  surfaceHover:"#11141c",
  border:      "#1a1d26",
  borderMid:   "#262b38",
  borderLight: "#2e3440",
  gold:        "#c9a84c",
  goldLight:   "#dbb85e",
  goldPale:    "#f0d78c",
  goldDim:     "rgba(201,168,76,0.15)",
  goldFaint:   "rgba(201,168,76,0.07)",
  goldGlow:    "rgba(201,168,76,0.22)",
  text:        "#e9ecf2",
  textHead:    "#f0f2f7",
  textSub:     "#a1a9b8",
  textMuted:   "#636b7a",
  green:       "#22c55e",
  greenDim:    "rgba(34,197,94,0.13)",
  greenGlow:   "rgba(34,197,94,0.20)",
  red:         "#ef4444",
  redDim:      "rgba(239,68,68,0.11)",
  blue:        "#60a5fa",
  blueDim:     "rgba(96,165,250,0.10)",
  amber:       "#f59e0b",
};

// ─── Mock data — thay bằng props.data trong production ───────────────────────
const MOCK_DATA = {
  name:    "Nguyễn Thành Nghiệp",
  title:   "Strategic Product Designer (UI/UX / AI-Native)",
  contact: {
    phone:    "09 333 12887",
    email:    "thanhnghiep@gmail.com",
    location: "Nhà Bè, TP.HCM",
    website:  "thanhnghiep.top",
    linkedin: "linkedin.com/in/nghiepnguyen",
    behance:  "behance.net/nghiepnguyen1208",
    dribbble: "dribbble.com/nghiepnguyen",
  },
  summary:
    "Strategic Product Designer với 10+ năm kinh nghiệm thiết kế kiến trúc thông tin phức tạp, design system mở rộng được, và hành trình người dùng cốt lõi cho hàng triệu người dùng tích cực trên các nền tảng lớn (Zalo, Zing MP3). Tận dụng nền tảng kỹ thuật vững chắc trong Mạng máy tính để đóng vai trò là cộng tác viên thông thạo frontend, chuyển đổi các bộ dữ liệu đa chiều phức tạp thành các giao diện trực quan, chuyển đổi cao. Thành thạo sử dụng Claude AI để tăng tốc tạo mẫu UI, xây dựng các thành phần sẵn sàng cho prompt và kết nối quy trình từ thiết kế đến code.",
  experience: [
    {
      role:    "Senior Product Designer",
      company: "VNG Corporation",
      period:  "03/2018 – Hiện tại",
      bullets: [
        "Dẫn dắt thiết kế sản phẩm các chức năng cốt lõi cho zNews, Zing MP3, Zing TV và hệ sinh thái nội bộ Zalo — đảm bảo tính toàn vẹn kiến trúc trên các luồng người dùng đa chiều phức tạp.",
        "Hợp tác với PO và Tech Lead xác định chiến lược MVP, giảm 20% ma sát từ thiết kế đến phát triển thông qua tài liệu Design System thân thiện với AI (Claude-friendly).",
        "Áp dụng UX Laws và nguyên tắc HCI vào prototype tương tác độ trung thực cao, giảm tải nhận thức trên checkout/navigation và cải thiện chỉ số hài lòng người dùng.",
        "Phân tích chủ động và phân loại điểm ma sát UX trong hệ sinh thái Zalo (zBox, zCloud, zBusiness) để tối đa hóa chuyển đổi luồng.",
        "Duy trì và mở rộng master Design System trên Zing MP3 Web/TV, BaoMoi và Internal Tools — đảm bảo nhất quán UI/UX, responsive và hỗ trợ đa ngôn ngữ.",
        "Tổ chức phiên design critique hàng tuần giữa các team, hướng dẫn junior designer về chiến lược thiết kế.",
      ],
    },
    {
      role:    "Senior UI Designer",
      company: "Deliveree On-Demand Logistics",
      period:  "09/2017 – 02/2018",
      bullets: [
        "Tái cấu trúc dashboard vận hành và màn hình theo dõi đặt chỗ phức tạp để tinh gọn quản lý logistics thời gian thực.",
        "Thiết kế chuyển đổi trạng thái và micro-interaction, giảm tỷ lệ bỏ cuộc trong luồng checkout đặt chỗ.",
      ],
    },
    {
      role:    "Senior UI Designer",
      company: "Sentifi",
      period:  "12/2015 – 09/2017",
      bullets: [
        "Chuyển đổi các bộ dữ liệu tình báo tài chính dày đặc, tín hiệu thị trường và danh mục cổ đông thành dashboard trực quan, tương tác cao.",
        "Thực hiện nghiên cứu người dùng và kiểm thử khả năng sử dụng trên các persona chính để tối ưu giao diện khám phá dữ liệu.",
      ],
    },
    {
      role:    "Web Designer",
      company: "ZIGExN VeNtura Co., Ltd",
      period:  "11/2013 – 12/2015",
      bullets: [
        "Xây dựng giao diện web lấy người dùng làm trung tâm với hệ thống phân cấp trực quan rõ ràng và hiệu suất tải tối ưu.",
        "Hình thành tư duy thông thạo code qua HTML, CSS và tiêu chuẩn layout tương tác.",
      ],
    },
  ],
  skills: {
    "Core UX/UI": [
      "Information Architecture", "Cognitive Load Reduction",
      "Heuristic Evaluation", "Visual Hierarchy",
      "Interaction Design", "Motion & Transitions",
      "Funnel Design", "CRO",
    ],
    "Systems & Strategy": [
      "Design System Management", "System Thinking",
      "Ecosystem Mapping", "Evidence-Based Design", "MVP Roadmap",
    ],
    "Design Tools": ["Figma", "Framer", "Photoshop", "Illustrator"],
    "AI & Productivity": ["Claude AI", "ChatGPT", "Jira", "Asana", "Git"],
    "Leadership": [
      "Design Critique", "Mentorship",
      "Cross-functional Collab", "Stakeholder Persuasion",
    ],
  },
  education: [
    { degree: "Multimedia Design", school: "Lotus University (HSU)", year: "2007 – 2009" },
    { degree: "Computer Network",  school: "Lotus University (HSU)", year: "2005 – 2007" },
  ],
  languages: [
    { name: "Tiếng Việt", level: 5 },
    { name: "English",    level: 4 },
  ],
};

// ─── CSS Reset & Responsive Helpers (injected once) ──────────────────────────
const STYLES_ID = "cv-premium-template-styles";
function injectBaseStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLES_ID)) return;
  const style = document.createElement("style");
  style.id = STYLES_ID;
  style.textContent = `
    .cv-premium-root {
      --cv-font-body: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      --cv-font-display: 'Barlow Condensed', 'Inter Tight', 'Impact', sans-serif;
      --cv-font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', ui-monospace, monospace;
    }
    @media (max-width: 768px) {
      .cv-premium-body-columns { flex-direction: column !important; }
      .cv-premium-sidebar { width: 100% !important; border-left: none !important; border-top: 1px solid #1a1d26; }
      .cv-premium-main-col { border-right: none !important; }
      .cv-premium-toolbar { flex-wrap: wrap; gap: 8px; }
      .cv-premium-toolbar-left { flex: 1 1 auto; }
      .cv-premium-toolbar-right { flex-wrap: wrap; gap: 4px; }
      .cv-premium-name { font-size: 26px !important; }
      .cv-premium-score-banner { flex-direction: column; align-items: flex-start; }
    }
    @media (max-width: 480px) {
      .cv-premium-name { font-size: 22px !important; }
      .cv-premium-title { font-size: 11px !important; }
      .cv-premium-content-wrapper { padding: 12px 12px 32px !important; }
      .cv-premium-cv-card { border-radius: 4px !important; }
    }
    @media print {
      .cv-premium-toolbar { display: none !important; }
      .cv-premium-score-banner-outer { display: none !important; }
      .cv-premium-info-bar { display: none !important; }
      .cv-premium-cv-card { box-shadow: none !important; border: 1px solid #ccc !important; }
    }
  `;
  document.head.appendChild(style);
}

// ─── UI Components ───────────────────────────────────────────────────────────

const SectionLabel = ({ children }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
  }}>
    <div style={{
      width: 3, height: 15, borderRadius: 2,
      background: `linear-gradient(180deg, ${T.goldLight} 0%, ${T.gold} 100%)`,
      flexShrink: 0,
    }} />
    <span style={{
      fontSize: 8.5, fontWeight: 800, letterSpacing: "0.22em",
      textTransform: "uppercase", color: T.goldLight,
      fontFamily: "var(--cv-font-mono)",
    }}>{children}</span>
    <div style={{ flex: 1, height: "0.5px", background: T.borderMid, opacity: 0.6 }} />
  </div>
);

const Chip = ({ children, variant = "gold" }) => {
  const base = {
    display: "inline-flex", alignItems: "center",
    padding: "2.5px 9px", borderRadius: 4,
    fontSize: 10, fontWeight: 650, letterSpacing: "0.03em",
    transition: "all 0.2s ease",
  };
  const styles = {
    gold:  { ...base, color: T.goldLight, background: T.goldDim, border: `1px solid ${T.gold}30` },
    dark:  { ...base, color: T.textSub,   background: T.surfaceHover, border: `1px solid ${T.borderLight}` },
    green: { ...base, color: T.green,     background: T.greenDim,   border: `1px solid ${T.green}28` },
    red:   { ...base, color: T.red,       background: T.redDim,     border: `1px solid ${T.red}28` },
    blue:  { ...base, color: T.blue,      background: T.blueDim,    border: `1px solid ${T.blue}24` },
  }[variant];
  return (
    <span style={styles}>{children}</span>
  );
};

const ScoreArc = ({ score }) => {
  const color = score >= 85 ? T.green : score >= 70 ? T.gold : T.red;
  const glow = score >= 85 ? T.greenGlow : score >= 70 ? T.goldGlow : T.redDim;
  const r = 28, circ = 2 * Math.PI * r;
  const fill = Math.min((score / 100) * circ, circ);
  return (
    <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
      <svg width="64" height="64" style={{ transform: "rotate(-90deg)", display: "block" }}>
        <defs>
          <filter id="score-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx="32" cy="32" r={r} fill="none" stroke={T.border} strokeWidth="4" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color}
          strokeWidth="4" strokeLinecap="round"
          strokeDasharray={`${fill} ${circ}`}
          filter={score >= 85 ? "url(#score-glow)" : undefined} />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{
          fontSize: 17, fontWeight: 900, color, lineHeight: 1,
          fontFamily: "var(--cv-font-display)",
        }}>{score}</span>
        <span style={{
          fontSize: 6.5, color: T.textMuted, letterSpacing: "0.14em", fontWeight: 700,
          fontFamily: "var(--cv-font-mono)",
        }}>MATCH</span>
      </div>
    </div>
  );
};

const LangBar = ({ level }) => (
  <div style={{ display: "flex", gap: 3 }}>
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} style={{
        width: 12, height: 6, borderRadius: 2,
        background: i < level
          ? `linear-gradient(135deg, ${T.gold} 0%, ${T.goldLight} 100%)`
          : T.borderMid,
        transition: "all 0.3s ease",
        boxShadow: i < level ? `0 0 6px ${T.goldDim}` : "none",
      }} />
    ))}
  </div>
);

const StripedDivider = () => (
  <div style={{
    width: "100%", height: 1, margin: "18px 0",
    background: `repeating-linear-gradient(90deg, ${T.border} 0px, ${T.border} 4px, transparent 4px, transparent 8px)`,
  }} />
);

const IconBtn = ({ children, onClick, variant = "ghost", title }) => {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "6px 15px", borderRadius: 6, fontSize: 10.5,
    fontWeight: 650, letterSpacing: "0.04em", cursor: "pointer",
    border: "1px solid", transition: "all 0.2s ease",
    fontFamily: "var(--cv-font-body)",
  };
  const v = {
    ghost:   { ...base, borderColor: T.borderLight, background: "transparent", color: T.textSub },
    outline: { ...base, borderColor: T.gold,         background: "transparent", color: T.gold },
    primary: { ...base, borderColor: T.gold,         background: `linear-gradient(135deg, ${T.gold} 0%, ${T.goldLight} 100%)`, color: "#090b10", boxShadow: `0 2px 12px ${T.goldDim}` },
  }[variant];
  return <button style={v} onClick={onClick} title={title}>{children}</button>;
};

// ─── Icons (inline SVG nhỏ) ──────────────────────────────────────────────────
const Icon = {
  copy: () => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  check: () => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  print: () => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="6" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 6V3h6v3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 10h6M5 12h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  contact: (icon) => {
    const paths = {
      phone:    "M3 3.5A1.5 1.5 0 014.5 2h.879a1.5 1.5 0 011.392.944l.605 1.513a1.5 1.5 0 01-.434 1.72L5.5 7.25C6.47 9.07 8 10.5 9.75 11.5l1.07-.942a1.5 1.5 0 011.72-.434l1.513.605A1.5 1.5 0 0115 12.12V13a1.5 1.5 0 01-1.5 1.5C5.94 14.5 1.5 9.06 1.5 3A1.5 1.5 0 013 1.5v2z",
      email:    "M2 5l6.002 4.5L14 5M2 4h12a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V5a1 1 0 011-1z",
      location: "M8 2a4.5 4.5 0 014.5 4.5C12.5 10 8 14 8 14S3.5 10 3.5 6.5A4.5 4.5 0 018 2zm0 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3z",
      link:     "M8.293 4.293a1 1 0 011.414 0l2 2a1 1 0 010 1.414l-2 2a1 1 0 01-1.414-1.414L9.586 7 8.293 5.707a1 1 0 010-1.414zM5 7a1 1 0 011-1h3a1 1 0 010 2H6a1 1 0 01-1-1z",
    };
    return (
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
        <path d={paths[icon] || paths.link} stroke={T.gold} strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    );
  },
  briefcase: () => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="4" width="12" height="9" rx="1.5" stroke={T.gold} strokeWidth="1.3" />
      <path d="M5.5 4V3a1 1 0 011-1h3a1 1 0 011 1v1" stroke={T.gold} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
};

// ─── Main Export ─────────────────────────────────────────────────────────────
export default function CvPremiumTemplate({
  data       = MOCK_DATA,
  matchScore = 91,
  matchedKw  = ["Figma", "Design System", "UX Laws", "AI Prototyping", "Cross-functional"],
  missingKw  = ["Sketch", "A/B Testing"],
  plan       = "pro",
  onPrint,
  onCopy,
}) {
  // Inject base styles once
  useMemo(() => { injectBaseStyles(); }, []);

  const [tab,    setTab]    = useState("preview"); // 'preview' | 'markdown'
  const [copied, setCopied] = useState(false);
  const cvRef = useRef(null);

  const handleCopy = () => {
    const md = buildMarkdown(data);
    onCopy?.(md);
    navigator.clipboard?.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    onPrint?.();
    window.print();
  };

  return (
    <div className="cv-premium-root" style={{
      background: T.bg, minHeight: "100vh", color: T.text,
      fontFamily: "var(--cv-font-body)",
    }}>
      {/* ── Toolbar ── */}
      <div className="cv-premium-toolbar" style={{
        background: `linear-gradient(180deg, ${T.surface} 0%, ${T.surfaceAlt} 100%)`,
        borderBottom: `1px solid ${T.borderMid}`,
        padding: "10px 24px", display: "flex", alignItems: "center",
        justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50,
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      }}>
        {/* Toolbar Left */}
        <div className="cv-premium-toolbar-left" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
            background: `linear-gradient(135deg, ${T.gold} 0%, #8b6914 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 2px 10px ${T.goldDim}`,
          }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="#fff" strokeWidth="1.4"/>
              <path d="M5 5h6M5 7.5h6M5 10h4" stroke="#fff" strokeWidth="1.1" strokeLinecap="round"/>
            </svg>
          </div>
          <span style={{
            fontSize: 12, fontWeight: 750, letterSpacing: "0.02em",
            fontFamily: "var(--cv-font-body)", color: T.text,
          }}>CV Tối Ưu</span>
          <span style={{
            fontSize: 9, fontWeight: 750, padding: "1.5px 9px", borderRadius: 4,
            background: T.goldDim, border: `1px solid ${T.gold}35`, color: T.gold,
            letterSpacing: "0.12em", fontFamily: "var(--cv-font-mono)",
          }}>
            {plan === "recruiter" ? "RECRUITER" : "PRO"}
          </span>
        </div>

        {/* Toolbar Right: Tabs + Actions */}
        <div className="cv-premium-toolbar-right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Tab switcher */}
          <div style={{
            display: "flex", background: T.surfaceAlt, borderRadius: 6,
            border: `1px solid ${T.border}`, padding: 2, gap: 2,
          }}>
            {["preview", "markdown"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "4px 13px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                letterSpacing: "0.06em", cursor: "pointer", textTransform: "uppercase",
                border: t === tab ? `1px solid ${T.gold}40` : "1px solid transparent",
                background: t === tab ? T.goldDim : "transparent",
                color: t === tab ? T.goldLight : T.textMuted,
                transition: "all 0.2s ease",
                fontFamily: "var(--cv-font-mono)",
              }}>
                {t === "preview" ? "Xem trước" : "Markdown"}
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 20, background: T.border, margin: "0 4px" }} />
          <IconBtn onClick={handleCopy} variant="outline">
            {copied ? <><Icon.check /> Đã sao chép</> : <><Icon.copy /> Sao chép MD</>}
          </IconBtn>
          <IconBtn onClick={handlePrint} variant="primary">
            <Icon.print /> In / PDF
          </IconBtn>
        </div>
      </div>

      {/* ── Content Wrapper ── */}
      <div className="cv-premium-content-wrapper" style={{
        maxWidth: 960, margin: "0 auto", padding: "24px 20px 48px",
      }}>
        {/* ════ Match Score Banner ════ */}
        <div className="cv-premium-score-banner cv-premium-score-banner-outer" style={{
          background: T.surface, border: `1px solid ${T.borderMid}`,
          borderRadius: 10, padding: "16px 20px", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 18,
        }}>
          <ScoreArc score={matchScore} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 8, color: T.textMuted, letterSpacing: "0.14em",
              textTransform: "uppercase", marginBottom: 8, fontWeight: 700,
              fontFamily: "var(--cv-font-mono)",
            }}>Độ phù hợp với JD sau khi tối ưu</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
              {matchedKw.map(k => <Chip key={k} variant="green">{k}</Chip>)}
              {missingKw.map(k => <Chip key={k} variant="red">⚠ {k}</Chip>)}
            </div>
            <div style={{ fontSize: 10, color: T.textMuted, lineHeight: 1.5 }}>
              <span style={{ color: T.green, fontWeight: 700 }}>{matchedKw.length}</span> từ khóa khớp{" · "}
              <span style={{ color: T.red, fontWeight: 700 }}>{missingKw.length}</span> còn thiếu{" · "}
              <span style={{ color: T.goldLight }}>AI đã tích hợp từ khóa ATS tự nhiên vào nội dung</span>
            </div>
          </div>
        </div>

        {/* ════ PREVIEW MODE ════ */}
        {tab === "preview" && (
          <div ref={cvRef} className="cv-premium-cv-card" style={{
            background: T.surface, border: `1px solid ${T.borderMid}`,
            borderRadius: 10, overflow: "hidden",
            boxShadow: `0 4px 30px rgba(0,0,0,0.4), 0 0 0 1px ${T.border}`,
          }}>
            {/* ── Header ── */}
            <div style={{
              background: `linear-gradient(160deg, #0a0c12 0%, #111620 50%, #0e1018 100%)`,
              borderBottom: `1px solid ${T.borderMid}`,
              padding: "32px 36px 24px",
              position: "relative", overflow: "hidden",
            }}>
              {/* Decorative glow orbs */}
              <div style={{ position: "absolute", top: -60, right: -60, width: 260, height: 260, background: `radial-gradient(circle, ${T.goldDim} 0%, transparent 65%)`, pointerEvents: "none" }} />
              <div style={{ position: "absolute", bottom: -40, left: "30%", width: 180, height: 100, background: `radial-gradient(ellipse, ${T.blueDim} 0%, transparent 70%)`, pointerEvents: "none" }} />

              {/* Gold accent line at top */}
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 2,
                background: `linear-gradient(90deg, transparent 0%, ${T.gold}40 20%, ${T.goldLight}60 50%, ${T.gold}40 80%, transparent 100%)`,
              }} />
              {/* Gold line bottom */}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0, height: 1,
                background: `linear-gradient(90deg, ${T.gold}60, ${T.goldLight}20, transparent)`,
              }} />

              {/* Eyebrow */}
              <div style={{
                fontSize: 8, color: T.gold, letterSpacing: "0.2em", marginBottom: 10,
                fontWeight: 700, fontFamily: "var(--cv-font-mono)",
                textTransform: "uppercase",
              }}>
                BẢN NHÁP TỐI ƯU ATS · CẤU TRÚC QUÉT NHANH
              </div>

              {/* Name */}
              <div className="cv-premium-name" style={{
                fontSize: 34, fontWeight: 950, letterSpacing: "-0.03em",
                color: T.textHead, textTransform: "uppercase", lineHeight: 1,
                marginBottom: 8,
                fontFamily: "var(--cv-font-display)",
              }}>{data.name}</div>

              {/* Title */}
              <div className="cv-premium-title" style={{
                fontSize: 13, color: T.goldLight, fontWeight: 650,
                letterSpacing: "0.03em", marginBottom: 18,
              }}>{data.title}</div>

              {/* Contact Row */}
              <div style={{
                display: "flex", flexWrap: "wrap", gap: "6px 22px",
              }}>
                {[
                  { icon: "phone",    val: data.contact.phone },
                  { icon: "email",    val: data.contact.email },
                  { icon: "location", val: data.contact.location },
                  { icon: "link",     val: data.contact.website },
                  { icon: "link",     val: data.contact.linkedin },
                  { icon: "link",     val: data.contact.behance },
                ].filter(c => c.val).map(({ icon, val }) => (
                  <span key={`${icon}-${val}`} style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    fontSize: 10.5, color: "rgba(255,255,255,0.45)",
                    padding: "2px 0",
                  }}>
                    <Icon.contact>{icon}</Icon.contact>
                    <span>{val}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* ── Body: 2-Column Layout ── */}
            <div className="cv-premium-body-columns" style={{ display: "flex" }}>
              {/* ════ Main Column ════ */}
              <div className="cv-premium-main-col" style={{
                flex: 1, padding: "28px 32px", minWidth: 0,
                borderRight: `1px solid ${T.border}`,
              }}>
                {/* Summary */}
                <div style={{ marginBottom: 28 }}>
                  <SectionLabel>Tóm tắt chuyên môn</SectionLabel>
                  <p style={{
                    fontSize: 12, lineHeight: 1.85, color: T.textSub, margin: 0,
                    borderLeft: `2px solid ${T.gold}50`, paddingLeft: 14,
                  }}>{data.summary}</p>
                </div>

                <StripedDivider />

                {/* Experience */}
                <div>
                  <SectionLabel>Kinh nghiệm làm việc</SectionLabel>
                  {data.experience.map((exp, i) => (
                    <div key={i} style={{
                      marginBottom: i < data.experience.length - 1 ? 22 : 0,
                      paddingBottom: i < data.experience.length - 1 ? 22 : 0,
                      borderBottom: i < data.experience.length - 1
                        ? `1px solid ${T.border}` : "none",
                    }}>
                      {/* Role + Period row */}
                      <div style={{
                        display: "flex", justifyContent: "space-between",
                        alignItems: "flex-start", marginBottom: 4, gap: 10,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Icon.briefcase />
                          <span style={{
                            fontSize: 13, fontWeight: 750, color: T.textHead,
                            fontFamily: "var(--cv-font-body)",
                          }}>{exp.role}</span>
                        </div>
                        <span style={{
                          fontSize: 9.5, fontWeight: 650, color: T.goldLight,
                          background: T.goldDim, border: `1px solid ${T.gold}28`,
                          padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap",
                          flexShrink: 0, fontFamily: "var(--cv-font-mono)",
                        }}>{exp.period}</span>
                      </div>
                      {/* Company */}
                      <div style={{
                        fontSize: 11, color: T.gold, fontWeight: 650,
                        letterSpacing: "0.03em", marginBottom: 10,
                      }}>{exp.company}</div>
                      {/* Bullets */}
                      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                        {exp.bullets.map((b, j) => (
                          <li key={j} style={{
                            display: "flex", gap: 9, fontSize: 11.5,
                            color: T.textSub, lineHeight: 1.75, marginBottom: 4,
                          }}>
                            <span style={{
                              color: T.gold, fontSize: 7, marginTop: 6,
                              flexShrink: 0, lineHeight: 1,
                            }}>◆</span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              {/* ════ Sidebar ════ */}
              <div className="cv-premium-sidebar" style={{
                width: 240, flexShrink: 0,
                padding: "28px 22px",
                background: `linear-gradient(180deg, ${T.surfaceAlt} 0%, ${T.bg} 100%)`,
                borderLeft: `1px solid ${T.border}`,
              }}>
                {/* Skills */}
                {Object.entries(data.skills).map(([group, items]) => (
                  <div key={group} style={{ marginBottom: 20 }}>
                    <SectionLabel>{group}</SectionLabel>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {items.map(s => (
                        <span key={s} style={{
                          fontSize: 10, padding: "3px 8px", borderRadius: 4,
                          background: T.goldFaint,
                          border: `1px solid ${T.gold}1a`,
                          color: T.textSub,
                          transition: "all 0.2s ease",
                          cursor: "default",
                        }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = T.goldDim;
                            e.currentTarget.style.borderColor = `${T.gold}40`;
                            e.currentTarget.style.color = T.text;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = T.goldFaint;
                            e.currentTarget.style.borderColor = `${T.gold}1a`;
                            e.currentTarget.style.color = T.textSub;
                          }}
                        >{s}</span>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Education */}
                <div style={{ marginBottom: 20 }}>
                  <SectionLabel>Học vấn</SectionLabel>
                  {data.education.map((e, i) => (
                    <div key={i} style={{
                      marginBottom: 12, padding: "10px 12px",
                      background: T.surfaceHover, borderRadius: 6,
                      border: `1px solid ${T.border}`,
                      transition: "border-color 0.2s ease",
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.borderMid; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; }}
                    >
                      <div style={{
                        fontSize: 11.5, fontWeight: 700, color: T.text,
                        marginBottom: 2, lineHeight: 1.4,
                      }}>{e.degree}</div>
                      <div style={{
                        fontSize: 10, color: T.gold, marginBottom: 2, fontWeight: 600,
                      }}>{e.school}</div>
                      <div style={{ fontSize: 9.5, color: T.textMuted }}>{e.year}</div>
                    </div>
                  ))}
                </div>

                {/* Languages */}
                <div style={{ marginBottom: 20 }}>
                  <SectionLabel>Ngôn ngữ</SectionLabel>
                  {data.languages.map((l, i) => (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between",
                      alignItems: "center", marginBottom: 10,
                      padding: "6px 0",
                    }}>
                      <span style={{
                        fontSize: 11, color: T.text, fontWeight: 650,
                      }}>{l.name}</span>
                      <LangBar level={l.level} />
                    </div>
                  ))}
                </div>

                {/* AI Note */}
                <div style={{
                  padding: "12px 14px", borderRadius: 6,
                  background: `linear-gradient(135deg, ${T.goldFaint} 0%, ${T.blueDim} 100%)`,
                  border: `1px solid ${T.gold}1a`,
                }}>
                  <div style={{
                    fontSize: 8, fontWeight: 750, letterSpacing: "0.16em",
                    color: T.gold, marginBottom: 6, textTransform: "uppercase",
                    fontFamily: "var(--cv-font-mono)",
                  }}>Ghi chú AI</div>
                  <p style={{
                    fontSize: 10, color: T.textMuted, lineHeight: 1.65, margin: 0,
                  }}>
                    CV đã được tối ưu theo JD đích. Từ khóa ATS được tích hợp tự nhiên.
                    {missingKw.length > 0 && ` Nên bổ sung: ${missingKw.join(", ")}.`}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Footer ── */}
            <div style={{
              background: T.bg, borderTop: `1px solid ${T.borderMid}`,
              padding: "10px 28px", display: "flex",
              justifyContent: "space-between", alignItems: "center",
              flexWrap: "wrap", gap: 8,
            }}>
              <span style={{
                fontSize: 9, fontWeight: 750, color: T.goldLight,
                letterSpacing: "0.14em", textTransform: "uppercase",
                fontFamily: "var(--cv-font-mono)",
              }}>cvFit.pro · {plan === "recruiter" ? "Recruiter" : "Pro"}</span>
              <span style={{ fontSize: 9, color: T.textMuted }}>
                Bản nháp do cvFit AI tạo ra · Kiểm tra nội dung trước khi sử dụng
              </span>
            </div>
          </div>
        )}

        {/* ════ MARKDOWN MODE ════ */}
        {tab === "markdown" && (
          <div style={{
            background: T.surface, border: `1px solid ${T.borderMid}`,
            borderRadius: 10, overflow: "hidden",
            boxShadow: `0 4px 24px rgba(0,0,0,0.3)`,
          }}>
            {/* Terminal title bar */}
            <div style={{
              padding: "10px 16px", background: T.surfaceAlt,
              borderBottom: `1px solid ${T.border}`,
              display: "flex", alignItems: "center", gap: 8,
              fontFamily: "var(--cv-font-mono)",
            }}>
              {["#ef4444","#f59e0b","#22c55e"].map(c => (
                <div key={c} style={{
                  width: 11, height: 11, borderRadius: "50%", background: c,
                  boxShadow: `0 0 4px ${c}60`,
                }} />
              ))}
              <span style={{
                fontSize: 10, color: T.textSub, marginLeft: 8,
                letterSpacing: "0.06em", fontWeight: 600,
              }}>optimized-cv.md</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: "0.08em" }}>
                UTF-8 | Markdown
              </span>
            </div>
            {/* Code content */}
            <pre style={{
              margin: 0, padding: "24px 28px",
              fontSize: 11.5, lineHeight: 1.8,
              color: T.textSub, overflowX: "auto",
              maxHeight: 600, overflowY: "auto",
              fontFamily: "var(--cv-font-mono)",
              background: `linear-gradient(180deg, ${T.bg} 0%, ${T.surfaceAlt} 100%)`,
              tabSize: 2, MozTabSize: 2,
            }}>
              <code>{buildMarkdown(data)}</code>
            </pre>
          </div>
        )}

        {/* Info Bar */}
        <div className="cv-premium-info-bar" style={{
          marginTop: 16, padding: "10px 16px", borderRadius: 8,
          background: T.blueDim, border: `1px solid ${T.blue}20`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="8" cy="8" r="7" stroke={T.blue} strokeWidth="1.4"/>
            <path d="M8 7v5M8 5v.5" stroke={T.blue} strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: 10.5, color: T.textMuted, lineHeight: 1.5 }}>
            Tính năng <strong style={{ color: T.blue, fontWeight: 700 }}>CV Tối Ưu</strong> chỉ dành cho gói{" "}
            <strong style={{ color: T.goldLight, fontWeight: 700 }}>Pro</strong> và{" "}
            <strong style={{ color: T.goldLight, fontWeight: 700 }}>Recruiter</strong>.
            Nội dung do AI sinh ra — hãy kiểm tra lại trước khi gửi nhà tuyển dụng.
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Utility: build Markdown from data ───────────────────────────────────────
function buildMarkdown(data) {
  const contact = Object.values(data.contact).filter(Boolean).join(" · ");

  const expSection = data.experience.map(e =>
    `### ${e.role} — ${e.company} *(${e.period})*\n${e.bullets.map(b => `- ${b}`).join("\n")}`
  ).join("\n\n");

  const skillSection = Object.entries(data.skills)
    .map(([g, items]) => `- **${g}:** ${items.join(", ")}`)
    .join("\n");

  const eduSection = data.education
    .map(e => `- **${e.degree}** — ${e.school} (${e.year})`)
    .join("\n");

  const langSection = data.languages
    .map(l => `- ${l.name}: ${"●".repeat(l.level)}${"○".repeat(5 - l.level)}`)
    .join("\n");

  return [
    `# ${data.name}`,
    `**${data.title}**`,
    contact,
    "",
    "---",
    "",
    "## Tóm tắt chuyên môn",
    data.summary,
    "",
    "---",
    "",
    "## Kinh nghiệm làm việc",
    "",
    expSection,
    "",
    "---",
    "",
    "## Kỹ năng",
    skillSection,
    "",
    "---",
    "",
    "## Học vấn",
    eduSection,
    "",
    "---",
    "",
    "## Ngôn ngữ",
    langSection,
    "",
    "---",
    "",
    "*Bản nháp do cvFit AI tạo ra · cvfit.pro*",
  ].join("\n");
}