import { ArrowUpRight } from 'lucide-react';

import { cn } from '@/lib/utils';

export default function ConfidenceMeter({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const safe = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const filled = Math.round(safe * 5);
  const percent = Math.round(safe * 100);

  return (
    <span
      className={cn('inline-flex items-center gap-1', className)}
      title={`置信度 ${percent}%`}
      aria-label={`置信度 ${percent}%`}
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <span
          key={index}
          aria-hidden
          className={cn('h-1.5 w-2.5', index < filled ? 'bg-primary' : 'bg-muted')}
        />
      ))}
    </span>
  );
}

export function EvidenceLink({
  count,
  onClick,
  label = '证据',
}: {
  count: number;
  onClick?: () => void;
  label?: string;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-primary transition-colors hover:text-primary/70"
      >
        {label} {count}
        <ArrowUpRight className="size-3" aria-hidden />
      </button>
    );
  }
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
      {label} {count}
    </span>
  );
}
