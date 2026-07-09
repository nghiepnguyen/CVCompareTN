import React, { useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import type { Components, ExtraProps } from 'react-markdown';
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

/** "Job Title — Company | MM/YYYY – MM/YYYY" → { role, company, period } (see rewriteService prompt spec) */
function parseJobHeading(raw: string): { role: string; company: string; period: string } | null {
  const m = raw.match(/^(.*?)\s*[—-]\s*(.*?)\s*\|\s*(.*)$/);
  if (!m) return null;
  const [, role, company, period] = m;
  if (!role.trim() || !company.trim() || !period.trim()) return null;
  return { role: role.trim(), company: company.trim(), period: period.trim() };
}

const PREMIUM_ACCENT = '#152D4F';

/* ─── PREMIUM components — light editorial CV, matches cv-ats-premium.html ─── */
function buildPremiumComponents(locale: 'vi' | 'en'): Components {
  return {
    /* ── H1: Name (usually stripped from body, header renders it instead) ── */
    h1: ({ children }) => (
      <header className="mb-8">
        <h1
          className="text-[34px] sm:text-[46px] font-light leading-none tracking-[-0.01em] text-[#141414]"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, 'Times New Roman', serif" }}
        >
          {children}
        </h1>
      </header>
    ),
    /* ── H2: Section label — uppercase caption + hairline rule ── */
    h2: ({ children }) => (
      <div className="mt-10 mb-6 flex items-center gap-3.5 first:mt-0">
        <span className="whitespace-nowrap text-[9.5px] font-bold uppercase tracking-[0.22em] text-[#152D4F]">
          {children}
        </span>
        <div className="h-px flex-1 bg-[#E0E0E0]" />
      </div>
    ),
    /* ── H3: Job entry — "Role — Company | Period" split into label col + content col ── */
    h3: ({ children }) => {
      const parsed = parseJobHeading(extractTextContent(children));
      if (parsed) {
        return (
          <div className="mt-7 grid grid-cols-[110px_1fr] gap-x-5 first:mt-0 sm:grid-cols-[148px_1fr] sm:gap-x-7">
            <div className="pt-[1px]">
              <p className="mb-1 text-[11px] leading-normal text-[#909090] sm:text-[11.5px]">{parsed.period}</p>
              <p className="text-[11px] font-semibold text-[#5E5E5E] sm:text-[11.5px]">{parsed.company}</p>
            </div>
            <div className="relative border-l-[1.5px] border-[#E0E0E0] pl-[18px] sm:pl-[22px]">
              <span
                className="absolute -left-[5.5px] top-[6px] size-2 rounded-full border-2 border-white"
                style={{ background: PREMIUM_ACCENT }}
              />
              <h3 className="text-[13.5px] font-semibold tracking-[-0.01em] text-[#141414] sm:text-[14.5px]">
                {parsed.role}
              </h3>
            </div>
          </div>
        );
      }
      return <h3 className="mt-7 mb-2 text-[14.5px] font-semibold text-[#141414]">{children}</h3>;
    },
    /* ── P: Body text ── */
    p: ({ children }) => (
      <p className="mb-5 max-w-[620px] text-[13.5px] font-light leading-[1.85] text-[#5E5E5E]">{children}</p>
    ),
    /* ── HR: Hairline divider ── */
    hr: () => <hr className="my-10 border-0 border-t border-[#E0E0E0]" />,
    strong: ({ children }) => <strong className="font-semibold text-[#141414]">{children}</strong>,
    a: ({ href, children }) => (
      <a
        href={href}
        className="text-[#152D4F] underline decoration-[#152D4F]/30 underline-offset-2 transition-colors hover:decoration-[#152D4F]"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ),
    blockquote: ({ children }) => (
      <blockquote className="my-6 border-l-2 border-[#152D4F]/40 pl-5 text-[13px] italic text-[#5E5E5E]">
        {children}
      </blockquote>
    ),
    /* ── UL/OL: aligned under the content column, hairline rule continues from the job entry above ── */
    ul: ({ className, children, ...props }) => (
      <ul
        className={cn(
          'mb-7 ml-[128px] flex flex-col gap-1.5 border-l-[1.5px] border-[#E0E0E0] pl-[18px] list-none sm:ml-[176px] sm:pl-[22px]',
          className,
        )}
        {...props}
      >
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-7 ml-[128px] flex flex-col gap-1.5 border-l-[1.5px] border-[#E0E0E0] pl-[18px] list-none sm:ml-[176px] sm:pl-[22px]">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="relative pl-[14px] text-[12.5px] font-light leading-[1.7] text-[#5E5E5E]">
        <span className="absolute left-0 top-[1px] text-[11px] text-[#152D4F]/60">—</span>
        {children}
      </li>
    ),
    table: ({ children }) => (
      <div className="my-8 overflow-x-auto border border-[#E0E0E0]">
        <table className="w-full border-collapse text-left text-[12.5px]">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead style={{ background: PREMIUM_ACCENT }} className="text-white">{children}</thead>,
    tbody: ({ children }) => <tbody className="bg-white">{children}</tbody>,
    tr: ({ children }) => <tr className="border-b border-[#E0E0E0] last:border-0">{children}</tr>,
    th: ({ children }) => (
      <th className="px-4 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.12em]">{children}</th>
    ),
    td: ({ children }) => <td className="px-4 py-2.5 text-[#5E5E5E]">{children}</td>,
    pre: ({ children }) => (
      <pre className="my-6 overflow-x-auto border border-[#E0E0E0] bg-[#F3F5F9] p-4 font-mono text-[12px] text-[#5E5E5E]">
        {children}
      </pre>
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
        <code className="rounded border border-[#E0E0E0] bg-[#F3F5F9] px-1.5 py-0.5 font-mono text-[12px] text-[#152D4F]" {...props}>
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
        // Premium: light editorial CV (matches cv-ats-premium.html) — no .cv-markdown-specimen defaults
        variant === 'premium'
          ? 'text-[13.5px] leading-relaxed text-[#5E5E5E]'
          : 'cv-markdown-specimen',
        className,
      )}
      style={variant === 'premium' ? { fontFamily: "'Plus Jakarta Sans', -apple-system, Arial, Helvetica, sans-serif" } : undefined}
    >
      <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeRaw, rehypeSanitize]} components={components}>
        {processed}
      </Markdown>
    </div>
  );
});
