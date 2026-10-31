import { cn } from '../../lib/utils';

export function Skeleton({ label, className }: { label: string; className?: string }) {
  return (
    <span role="status" aria-label={label} className={cn(
      'inline-block h-4 w-12 align-middle rounded bg-slate-200 dark:bg-slate-700 motion-safe:animate-pulse',
      className
    )}>
      <span className="sr-only">{label}</span>
    </span>
  );
}
