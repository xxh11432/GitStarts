import Link from 'next/link';
import { platformLabel } from '@/lib/labels';
import type { Repo } from '@/lib/types';

function formatCount(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return String(n);
}

function formatDate(value?: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

export default function RepoCard({ repo }: { repo: Repo }) {
  const updatedAt = formatDate(repo.pushedAt);
  const platform = platformLabel(repo.platform);

  return (
    <article className="rounded-card border border-line bg-background p-4 shadow-card transition duration-150 ease-out hover:border-gray-300 hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/repos/${repo.fullName}`}
          className="min-w-0 break-words text-base font-semibold text-ink hover:text-accent"
        >
          {repo.fullName}
        </Link>
        <span className="shrink-0 text-sm tabular-nums text-ink-secondary">
          {formatCount(repo.stars)} stars
        </span>
      </div>

      {repo.description && (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-secondary">
          {repo.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-muted">
        {repo.language && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ink-muted" />
            {repo.language}
          </span>
        )}
        {platform && (
          <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-ink-secondary">
            {platform}
          </span>
        )}
        {repo.category && (
          <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-ink-secondary">
            {repo.category}
          </span>
        )}
        {updatedAt && <span>更新于 {updatedAt}</span>}
      </div>
    </article>
  );
}
