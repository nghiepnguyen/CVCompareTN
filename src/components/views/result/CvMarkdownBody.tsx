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

function buildComponents(locale: 'vi' | 'en'): Components {
  const stamp =
    locale === 'vi'
      ? 'Bản nháp tối ưu ATS · cấu trúc quét nhanh'
      : 'ATS-optimized draft · recruiter-scan layout';

  return {
    h1: ({ children }) => (
      <header className="mb-10 border-b-[10px] border-cv-border pb-8">
        {/* Typography: index.css .cv-markdown-specimen :where(h1), header > p */}
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

export interface CvMarkdownBodyProps {
  markdown: string;
  locale: 'vi' | 'en';
  /** Screen: narrow measure; print: use full column inside margins */
  density?: 'screen' | 'print';
  className?: string;
}

export const CvMarkdownBody = React.memo(function CvMarkdownBody({
  markdown,
  locale,
  density = 'screen',
  className,
}: CvMarkdownBodyProps) {
  const components = useMemo(() => buildComponents(locale), [locale]);
  const processed = useMemo(() => preprocessFullRewrittenCvMarkdown(markdown || ''), [markdown]);

  return (
    <div
      className={cn('cv-markdown-specimen break-words', density === 'screen' && 'mx-auto max-w-[62ch]', className)}
    >
      <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeRaw, rehypeSanitize]} components={components}>
        {processed}
      </Markdown>
    </div>
  );
});
