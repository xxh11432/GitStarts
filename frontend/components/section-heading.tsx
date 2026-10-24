import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

export default function SectionHeading({
  index,
  title,
  count,
  href,
  actionLabel = '查看全部',
}: {
  index: string;
  title: string;
  count?: number;
  href?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-3">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[11px] text-muted-foreground">{index}</span>
        <h2 className="text-section font-semibold text-foreground">{title}</h2>
        {typeof count === 'number' ? (
          <span className="font-mono text-[11px] text-muted-foreground">{count}</span>
        ) : null}
      </div>
      {href ? (
        <Link
          href={href}
          className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-primary"
        >
          {actionLabel}
          <ArrowUpRight className="size-3.5" />
        </Link>
      ) : null}
    </div>
  );
}
