import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchRepo } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { fullName: string[] };
}

export default async function RepoDetailPage({ params }: PageProps) {
  const fullName = params.fullName.join('/');
  let repo;
  try {
    repo = await fetchRepo(fullName);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Link href="/repos" className="text-sm text-blue-600 hover:underline">
        ← 返回列表
      </Link>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h1 className="text-2xl font-bold text-blue-600">{repo.fullName}</h1>
        {repo.description && <p className="mt-3 text-gray-700">{repo.description}</p>}

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Stars" value={repo.stars} />
          <Stat label="Forks" value={repo.forks} />
          <Stat label="Watchers" value={repo.watchers} />
          <Stat label="Open Issues" value={repo.openIssues} />
        </div>

        <div className="mt-6 flex flex-wrap gap-2 text-sm">
          {repo.language && (
            <span className="rounded bg-gray-100 px-3 py-1">{repo.language}</span>
          )}
          {repo.license && (
            <span className="rounded bg-gray-100 px-3 py-1">{repo.license}</span>
          )}
          {repo.category && (
            <span className="rounded bg-blue-50 px-3 py-1 text-blue-600">{repo.category}</span>
          )}
          {repo.topics.map((topic) => (
            <span key={topic} className="rounded bg-gray-100 px-3 py-1">
              {topic}
            </span>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <a
            href={`https://github.com/${repo.fullName}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-gray-700"
          >
            在 GitHub 查看
          </a>
          {repo.homepage && (
            <a
              href={repo.homepage}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:border-blue-300"
            >
              项目主页
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-gray-50 p-4 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
