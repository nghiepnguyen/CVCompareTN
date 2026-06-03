import React, { useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import type { Components, ExtraProps } from 'react-markdown';
import { GraduationCap, Briefcase, Lightbulb, Award, Code, Calendar } from 'lucide-react';
import { cn } from '../../../lib/utils';
import {
  preprocessFullRewrittenCvMarkdown,
  fullRewrittenCvToPlainText,
} from '../../../services/ai/fullRewrittenCvMarkdown';

/** @deprecated use preprocessFullRewrittenCvMarkdown */
export function preprocessCvMarkdown(source: string): string {
  return preprocessFullRewrittenCvMarkdown(source);
}

/** Plain-text copy helper */
export function markdownToPlainText(md: string): string {
  return fullRewrittenCvToPlainText(md);
}

// Section icon mapping for premium layout
const sectionIcons: Record<string, React.ReactNode> = {
  professionalSummary: <Lightbulb className="size-4" />,
  'professional summary': <Lightbulb className="size-4" />,
  careerObjective: <Lightbulb className="size-4" />,
  'career objective': <Lightbulb className="size-4" />,
  'tóm tắt': <Lightbulb className="size-4" />,
  'mục tiêu nghề nghiệp': <Lightbulb className="size-4" />,
  workExperience: <Briefcase className="size-4" />,
  'work experience': <Briefcase className="size-4" />,
  'professional experience': <Briefcase className="size-4" />,
  'kinh nghiệm làm việc': <Briefcase className="size-4" />,
  'kinh nghiệm': <Briefcase className="size-4" />,
  education: <GraduationCap className="size-4" />,
  'học vấn': <GraduationCap className="size-4" />,
  skills: <Code className="size-4" />,
  'technical skills': <Code className="size-4" />,
  'kỹ năng': <Code className="size-4" />,
  'kỹ năng chuyên môn': <Code className="size-4" />,
  projects: <Award className="size-4" />,
  'dự án': <Award className="size-4" />,
  certifications: <Award className="size-4" />,
  'chứng chỉ': <Award className="size-4" />,
};

function getSectionIcon(headingText: string): React.ReactNode | null {
  const key = headingText.toLowerCase().trim();
  return sectionIcons[key] || null;
}

const accentColors = [
  'border-l-emerald-500',
  'border-l-blue-500',
  'border-l-violet-500',
  'border-l-amber-500',
  'border-l-rose-500',
  'border-l-cyan-500',
];

let accentIdx = 0;
function getAccentColor(): string {
  return accentColors[accentIdx++ % accentColors.length];
}

/* ─── PREMIUM components — Black+Gold Liquid Glass ─── */
function buildPremiumComponents(locale: 'vi' | 'en'): Components {
  // Reset accent index per render
  accentIdx = 0;

  return {
    /* ── H1: Name — Ultra-bold black with gold underline ── */
    h1: ({ children }) => (
      <header className="mb-14">
        <h1 className="font-cv-header text-[2.25rem] sm:text-[3rem] font-black uppercase leading-[0.88] tracking-[-0.05em] text-[#0C0A09]">
          {children}
        </h1>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-[2px] w-16 bg-gradient-to-r from-amber-500 to-amber-400 rounded-full" />
          <div className="h-px flex-1 bg-gradient-to-r from-amber-200/60 to-transparent" />
        </div>
      </header>
    ),
    /* ── H2: Section headers — Gold pill badge + elegant title ── */
    h2: ({ children }) => {
      const headingStr = extractTextContent(children);
      const icon = getSectionIcon(headingStr);
      const accent = getAccentColor();
      return (
        <div className="mt-14 mb-8 first:mt-2">
          {/* Section ribbon */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-50/80 via-amber-50/40 to-transparent rounded-r-2xl -left-4 -right-2" />
            <div className="relative flex items-center gap-4">
              <div className={`shrink-0 w-1 h-8 rounded-full bg-gradient-to-b ${accent.replace('border-l-', 'from-')} to-amber-300`} />
              <div className="flex items-center gap-3">
                {icon && (
                  <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200/60 text-amber-700 shadow-sm">
                    {icon}
                  </span>
                )}
                <h2 className="font-cv-header text-[0.85rem] font-black uppercase tracking-[0.12em] text-[#1C1917]">
                  {children}
                </h2>
              </div>
            </div>
          </div>
        </div>
      );
    },
    /* ── H3: Sub-sections — Gold bullet ── */
    h3: ({ children }) => {
      const accent = getAccentColor();
      return (
        <h3 className={`mt-7 mb-3 font-cv-header text-[0.78rem] font-black tracking-[0.06em] text-[#292524] flex items-center gap-2`}>
          <span className={`size-1.5 rounded-full bg-gradient-to-b ${accent.replace('border-l-', 'from-')} to-amber-400 shrink-0`} />
          {children}
        </h3>
      );
    },
    /* ── P: Body text — Warm dark gray ── */
    p: ({ children }) => (
      <p className="mb-5 text-[0.82rem] leading-[1.7] text-[#44403C]">{children}</p>
    ),
    /* ── HR: Gold gradient divider ── */
    hr: () => (
      <div className="my-12 flex items-center gap-3">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-200/50 to-transparent" />
        <span className="size-1 rounded-full bg-amber-300/60" />
        <span className="size-1 rounded-full bg-amber-300/40" />
        <span className="size-1 rounded-full bg-amber-300/20" />
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-200/50 to-transparent" />
      </div>
    ),
    /* ── Strong: Gold highlight ── */
    strong: ({ children }) => (
      <strong className="font-bold text-[#1C1917] bg-gradient-to-r from-amber-100/60 to-amber-50/40 px-0.5 rounded-sm">
        {children}
      </strong>
    ),
    a: ({ href, children }) => (
      <a href={href} className="text-amber-700 underline decoration-amber-300/50 underline-offset-2 hover:decoration-amber-500 transition-colors" target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    /* ── Blockquote: Elegant callout ── */
    blockquote: ({ children }) => (
      <blockquote className="my-8 border-l-[3px] border-amber-400 bg-gradient-to-r from-amber-50/70 to-transparent py-4 pl-6 rounded-r-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 text-[6rem] leading-none text-amber-200/30 select-none pointer-events-none font-serif">"</div>
        <div className="relative text-[0.82rem] italic text-[#57534E] leading-relaxed">{children}</div>
      </blockquote>
    ),
    /* ── UL: Bullet list with gold dots ── */
    ul: ({ className, children, ...props }) => (
      <ul
        className={cn(
          'mb-7 space-y-3',
          typeof className === 'string' && className.includes('contains-task-list')
            ? 'list-none pl-0'
            : 'list-none pl-0',
          className,
        )}
        {...props}
      >
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-7 space-y-3.5 pl-0 list-none">{children}</ol>
    ),
    li: ({ children }) => (
      <li className="flex items-start gap-3 text-[0.82rem] text-[#44403C] leading-relaxed pl-0 group">
        <span className="mt-[0.5em] size-1.5 shrink-0 rounded-full bg-gradient-to-b from-amber-400 to-amber-500 shadow-[0_0_6px_rgba(202,138,4,0.25)] transition-shadow group-hover:shadow-[0_0_10px_rgba(202,138,4,0.4)]" />
        <span>{children}</span>
      </li>
    ),
    /* ── Table: Elegant card ── */
    table: ({ children }) => (
      <div className="my-9 overflow-hidden rounded-2xl border border-amber-200/40 shadow-sm shadow-amber-100/20">
        <table className="w-full border-collapse text-left text-[0.8rem]">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-gradient-to-r from-[#1C1917] to-[#292524] text-amber-100">{children}</thead>
    ),
    tbody: ({ children }) => <tbody className="bg-[#FAFAF9]">{children}</tbody>,
    tr: ({ children }) => <tr className="border-b border-amber-100/40 last:border-0 hover:bg-amber-50/30 transition-colors">{children}</tr>,
    th: ({ children }) => (
      <th className="font-cv-header px-5 py-3.5 text-[0.65rem] font-black uppercase tracking-[0.1em] text-amber-200">{children}</th>
    ),
    td: ({ children }) => <td className="px-5 py-3.5 text-[#44403C]">{children}</td>,
    pre: ({ children }) => (
      <pre className="my-7 overflow-x-auto rounded-xl border border-amber-200/30 bg-[#FAFAF9] p-5 font-mono text-[0.75rem] text-[#44403C]">{children}</pre>
    ),
    code: ({ className, children, ...props }: React.ClassAttributes<HTMLElement> &
      React.HTMLAttributes<HTMLElement> &
      ExtraProps) => {
      const isBlock = Boolean(className?.includes('language-'));
      if (isBlock) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      }
      return (
        <code className="rounded-md border border-amber-200/30 bg-amber-50/50 px-1.5 py-0.5 font-mono text-[0.75rem] text-amber-900" {...props}>
          {children}
        </code>
      );
    },
  };
}

/* ─── DEFAULT / FREE components ─── */
function buildDefaultComponents(locale: 'vi' | 'en'): Components {
  const stamp =
    locale === 'vi'
      ? 'Bản nháp tối ưu ATS · cấu trúc quét nhanh'
      : 'ATS-optimized draft · recruiter-scan layout';

  return {
    h1: ({ children }) => (
      <header className="mb-10 border-b-[10px] border-cv-border pb-8">
        <h1>{children}</h1>
        <p className="mt-4">{stamp}</p>
      </header>
    ),
    h2: ({ children }) => (
      <h2 className="mt-14 mb-6 min-w-0 border-b-4 border-cv-border pb-2">{children}</h2>
    ),
    h3: ({ children }) => <h3 className="mt-8 mb-2 min-w-0">{children}</h3>,
    p: ({ children }) => <p className="mb-5 text-left">{children}</p>,
    hr: () => <hr className="my-12 border-0 border-t-[6px] border-cv-border/15" />,
    strong: ({ children }) => <strong className="border-b-2 border-cv-indigo/20">{children}</strong>,
    a: ({ href, children }) => (
      <a href={href} className="break-words hover:opacity-90" target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    blockquote: ({ children }) => (
      <blockquote className="my-6 border-l-4 border-cv-indigo py-1 pl-4">{children}</blockquote>
    ),
    ul: ({ className, children, ...props }) => (
      <ul
        className={cn(
          'mb-8 space-y-2',
          typeof className === 'string' && className.includes('contains-task-list')
            ? 'list-none pl-0'
            : 'list-disc pl-6 marker:text-cv-muted',
          className,
        )}
        {...props}
      >
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-8 list-decimal space-y-2 pl-6 marker:font-cv-header marker:text-[13px] marker:font-black marker:text-cv-muted">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="[&_ol]:mt-2 [&_ul]:mt-2">{children}</li>,
    table: ({ children }) => (
      <div className="my-8 overflow-x-auto border border-cv-border">
        <table className="w-full min-w-[16rem] border-collapse text-left text-[13px]">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-cv-dark text-white">{children}</thead>,
    tbody: ({ children }) => <tbody className="bg-surface">{children}</tbody>,
    tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
    th: ({ children }) => (
      <th className="font-cv-header px-3 py-2 text-[10px] font-black uppercase tracking-wider">{children}</th>
    ),
    td: ({ children }) => <td className="border-border px-3 py-2 align-top">{children}</td>,
    pre: ({ children }) => (
      <pre className="my-6 overflow-x-auto border border-cv-border bg-surface-muted p-4 font-mono">{children}</pre>
    ),
    code: ({ className, children, ...props }: React.ClassAttributes<HTMLElement> &
      React.HTMLAttributes<HTMLElement> &
      ExtraProps) => {
      const isBlock = Boolean(className?.includes('language-'));
      if (isBlock) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      }
      return (
        <code className="rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono" {...props}>
          {children}
        </code>
      );
    },
  };
}

/** Helper: extract plain text from React children */
function extractTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractTextContent).join('');
  if (React.isValidElement(children)) {
    const props = children.props as Record<string, unknown>;
    if (props?.children) {
      return extractTextContent(props.children as React.ReactNode);
    }
  }
  return '';
}

export interface CvMarkdownBodyProps {
  markdown: string;
  locale: 'vi' | 'en';
  /** Screen: narrow measure; print: use full column inside margins */
  density?: 'screen' | 'print';
  /** Layout variant: premium uses modern card-based design, free uses simple markdown */
  variant?: 'premium' | 'free';
  className?: string;
}

export const CvMarkdownBody = React.memo(function CvMarkdownBody({
  markdown,
  locale,
  density = 'screen',
  variant = 'free',
  className,
}: CvMarkdownBodyProps) {
  const components = useMemo(
    () => variant === 'premium' ? buildPremiumComponents(locale) : buildDefaultComponents(locale),
    [locale, variant]
  );
  const processed = useMemo(() => preprocessFullRewrittenCvMarkdown(markdown || ''), [markdown]);

  return (
    <div
      className={cn(
        'break-words',
        // Premium: clean modern styling — no .cv-markdown-specimen defaults
        variant === 'premium'
          ? 'font-cv text-[0.82rem] leading-relaxed text-slate-600'
          : 'cv-markdown-specimen',
        className,
      )}
    >
      <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeRaw, rehypeSanitize]} components={components}>
        {processed}
      </Markdown>
    </div>
  );
});
