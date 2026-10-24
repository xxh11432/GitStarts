import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { platformLabel } from '@/lib/labels';
import type { Repo } from '@/lib/types';

function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function formatDate(value?: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export default function RepoRow({ repo, index }: { repo: Repo; index?: string }) {
  const platform = platformLabel(repo.platform);
  const updatedAt = formatDate(repo.pushedAt);

  return (
    <article className="group flex gap-3 border-b border-border py-4 transition-colors last:border-b-0 hover:bg-card sm:gap-4">
      {index ? (
        <span className="w-6 shrink-0 pt-1 font-mono text-[11px] text-muted-foreground">
          {index}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link
            href={`/repos/${repo.fullName}`}
            className="break-words font-mono text-[13px] font-medium text-foreground decoration-primary decoration-2 underline-offset-4 hover:underline"
          >
            {repo.fullName}
          </Link>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            ★ {formatCount(repo.stars)}
          </span>
          {repo.language ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              <span aria-hidden className="size-1.5 rounded-full bg-primary/70" />
              {repo.language}
            </span>
          ) : null}
        </div>
        {repo.description ? (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
            {repo.description}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {platform ? <span className="border border-border px-1.5 py-0.5">{platform}</span> : null}
          {repo.category ? <span className="border border-border px-1.5 py-0.5">{repo.category}</span> : null}
          {updatedAt ? <span>更新于 {updatedAt}</span> : null}
        </div>
      </div>
      <ArrowUpRight
        aria-hidden
        className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
      />
    </article>
  );
}
