import Link from 'next/link';
import type { ChatRepo } from '@/lib/chat';

function formatCount(value?: number): string {
  if (value === undefined) {
    return '';
  }
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

export default function RepoMiniCard({ repo }: { repo: ChatRepo }) {
  return (
    <article className="rounded-card border border-line bg-background p-3 transition-colors duration-150 hover:border-accent">
      <div className="flex items-baseline justify-between gap-2">
        <Link
          href={`/repos/${repo.fullName}`}
          className="min-w-0 truncate text-sm font-medium text-ink hover:text-accent"
        >
          {repo.fullName}
        </Link>
        {repo.stars !== undefined && (
          <span className="shrink-0 text-xs tabular-nums text-ink-muted">
            {formatCount(repo.stars)} stars
          </span>
        )}
      </div>
      {repo.description && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-secondary">
          {repo.description}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-ink-muted">
        {repo.language && (
          <span className="rounded-full border border-line px-1.5 py-0.5">{repo.language}</span>
        )}
        {repo.license && (
          <span className="rounded-full border border-line px-1.5 py-0.5">{repo.license}</span>
        )}
        {repo.platform && repo.platform !== 'other' && (
          <span className="rounded-full border border-line px-1.5 py-0.5">{repo.platform}</span>
        )}
      </div>
    </article>
  );
}
