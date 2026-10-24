import { BadgeCheck } from 'lucide-react';

import { cn } from '@/lib/utils';

export default function VerdictStamp({
  label = 'Verdict · 推荐',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border-2 border-primary px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-primary',
        className,
      )}
    >
      <BadgeCheck className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
