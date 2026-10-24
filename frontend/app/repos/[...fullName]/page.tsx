import Link from 'next/link';
import { notFound } from 'next/navigation';
import RepoCard from '@/components/RepoCard';
import { fetchRepo, fetchRepoSummary, fetchSimilarRepos } from '@/lib/api';
import { platformLabel } from '@/lib/labels';
import type { ReadmeSummary, Repo } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { fullName: string[] };
}

export default async function RepoDetailPage({ params }: PageProps) {
  const fullName = params.fullName.join('/');

  let repo: Repo;
  try {
    repo = await fetchRepo(fullName);
  } catch {
    notFound();
  }

  const [readme, similar] = await Promise.all([
    fetchRepoSummary(fullName).catch(() => null as ReadmeSummary | null),
    fetchSimilarRepos(fullName, 6).catch(() => [] as Repo[]),
  ]);

  const updatedAt = formatDate(repo.pushedAt);
  const platform = platformLabel(repo.platform);

  return (
    <div className="space-y-8">
      <Link
        href="/repos"
        className="inline-block text-sm text-ink-secondary transition-colors hover:text-accent"
      >
        ← 返回列表
      </Link>

      <article className="rounded-card border border-line bg-surface p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          {platform && <Badge>{platform}</Badge>}
          {repo.category && <Badge>{repo.category}</Badge>}
          {repo.license && <Badge>{repo.license}</Badge>}
        </div>

        <h1 className="mt-3 break-words text-title font-semibold text-ink">{repo.fullName}</h1>
        {repo.description && (
          <p className="mt-2 max-w-3xl text-body leading-relaxed text-ink-secondary">{repo.description}</p>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
          <Stat label="Stars" value={repo.stars} />
          <Stat label="Forks" value={repo.forks} />
          <Stat label="Watchers" value={repo.watchers} />
          <Stat label="Open Issues" value={repo.openIssues} />
        </dl>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted">
          {repo.language && <span>语言：{repo.language}</span>}
          {updatedAt && <span>最近更新：{updatedAt}</span>}
          {repo.defaultBranch && <span>默认分支：{repo.defaultBranch}</span>}
        </div>

        {repo.topics.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {repo.topics.slice(0, 12).map((topic) => (
              <Link
                key={topic}
                href={`/repos?topic=${encodeURIComponent(topic)}`}
                className="rounded-full border border-line bg-background px-2.5 py-1 text-xs text-ink-secondary transition-colors hover:border-accent hover:text-accent"
              >
                {topic}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={`https://github.com/${repo.fullName}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            在 GitHub 查看
          </a>
          {repo.homepage && (
            <a
              href={repo.homepage}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-line bg-background px-4 py-2 text-sm text-ink-secondary transition-colors hover:border-accent hover:text-accent"
            >
              项目主页
            </a>
          )}
        </div>
      </article>

      <section className="rounded-card border border-line bg-background p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold text-ink">README 摘要</h2>
          <a
            href={readme?.sourceUrl ?? `https://github.com/${repo.fullName}#readme`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-ink-secondary transition-colors hover:text-accent"
          >
            查看 README 原文
          </a>
        </div>
        {readme?.summary ? (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-secondary">{readme.summary}</p>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">README 摘要暂不可用，可点击上方链接查看原文。</p>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold text-ink">相关推荐</h2>
          <Link href="/repos" className="text-sm text-ink-secondary transition-colors hover:text-accent">
            浏览全部
          </Link>
        </div>
        {similar.length === 0 ? (
          <div className="rounded-card border border-dashed border-line bg-surface px-4 py-10 text-center text-sm text-ink-muted">
            暂无相关推荐
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {similar.map((item) => (
              <RepoCard key={item.id} repo={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-line bg-background px-2.5 py-1 text-xs text-ink-secondary">
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-background px-4 py-4 text-center">
      <dd className="text-xl font-semibold tabular-nums text-ink">
        {value.toLocaleString('zh-CN')}
      </dd>
      <dt className="mt-1 text-xs text-ink-muted">{label}</dt>
    </div>
  );
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
