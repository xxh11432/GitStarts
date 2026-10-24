import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { cn } from '@/lib/utils';

export default function PageHeader({
  index,
  eyebrow,
  title,
  description,
  meta,
  actions,
  className,
}: {
  index?: string;
  eyebrow: string;
  title: string;
  description?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('border-b border-border pb-6', className)}>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
            {index ? <span className="text-muted-foreground">{index} / </span> : null}
            {eyebrow}
          </p>
          <h1 className="mt-2 break-words font-display text-title font-semibold text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-body text-muted-foreground">{description}</p>
          ) : null}
          {meta ? <div className="mt-3">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
      <ArrowUpRight className="size-3.5" />
    </Link>
  );
}
