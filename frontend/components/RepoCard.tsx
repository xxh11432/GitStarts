import Link from 'next/link';
import type { Repo } from '@/lib/types';

function formatCount(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return String(n);
}

export default function RepoCard({ repo }: { repo: Repo }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 transition hover:shadow-md">
      <Link
        href={`/repos/${repo.fullName}`}
        className="text-base font-semibold text-blue-600 hover:underline"
      >
        {repo.fullName}
      </Link>
      {repo.description && (
        <p className="mt-1 line-clamp-2 text-sm text-gray-600">{repo.description}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        {repo.language && (
          <span className="rounded bg-gray-100 px-2 py-0.5">{repo.language}</span>
        )}
        {repo.category && (
          <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-600">{repo.category}</span>
        )}
        <span>Stars {formatCount(repo.stars)}</span>
        <span>Forks {repo.forks}</span>
      </div>
    </div>
  );
}
