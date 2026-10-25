import Link from 'next/link';
import { platformLabel } from '@/lib/labels';
import type { ChatRepo } from '@/lib/chat';

function formatCount(value?: number): string {
  if (value === undefined) {
    return '';
  }
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

export default function RepoMiniCard({ repo }: { repo: ChatRepo }) {
  const platform = repo.platform && repo.platform !== 'other' ? platformLabel(repo.platform) : undefined;
  return (
    <article className="rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40">
      <div className="flex items-baseline justify-between gap-2">
        <Link
          href={`/repos/${repo.fullName}`}
          className="min-w-0 truncate font-mono text-[12px] font-medium text-foreground decoration-primary decoration-2 underline-offset-4 hover:underline"
        >
          {repo.fullName}
        </Link>
        {repo.stars !== undefined ? (
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
            ★ {formatCount(repo.stars)}
          </span>
        ) : null}
      </div>
      {repo.description ? (
        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
          {repo.description}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1">
        {[repo.language, repo.license, platform].filter(Boolean).map((label) => (
          <span
            key={label}
            className="rounded-full border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground"
          >
            {label}
          </span>
        ))}
      </div>
    </article>
  );
}
