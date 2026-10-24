import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, ExternalLink } from 'lucide-react';

import FavoriteButton from '@/components/FavoriteButton';
import GithubMark from '@/components/github-mark';
import EmptyState from '@/components/empty-state';
import RepoRow from '@/components/repo-row';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { fetchFavoriteStatus, fetchMe, fetchRepo, fetchRepoSummary, fetchSimilarRepos } from '@/lib/api';
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

  const me = await fetchMe();
  const [readme, similar, favorite] = await Promise.all([
    fetchRepoSummary(fullName).catch(() => null as ReadmeSummary | null),
    fetchSimilarRepos(fullName, 6).catch(() => [] as Repo[]),
    me ? fetchFavoriteStatus(fullName).catch(() => null) : Promise.resolve(null),
  ]);

  const updatedAt = formatDate(repo.pushedAt);
  const platform = platformLabel(repo.platform);
  const homepage = safeHttpUrl(repo.homepage);

  return (
    <div className="flex flex-col gap-8">
      <Breadcrumb>
        <BreadcrumbList className="font-mono text-[10px] uppercase tracking-[0.12em]">
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/repos">仓库</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-mono text-[10px] uppercase tracking-[0.12em]">
              {repo.fullName}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <section className="flex flex-col gap-5 border-b border-border pb-6">
        <div className="flex flex-wrap items-center gap-1.5">
          {platform ? <Tag>{platform}</Tag> : null}
          {repo.category ? <Tag>{repo.category}</Tag> : null}
          {repo.license ? <Tag>{repo.license}</Tag> : null}
        </div>

        <div className="flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
            Repository dossier
          </p>
          <h1 className="break-words font-display text-title font-semibold text-foreground">
            {repo.fullName}
          </h1>
          {repo.description ? (
            <p className="max-w-3xl text-body leading-relaxed text-muted-foreground">
              {repo.description}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" className="rounded-none">
            <a href={`https://github.com/${repo.fullName}`} target="_blank" rel="noreferrer">
              <GithubMark className="size-3.5" />
              在 GitHub 查看
              <ExternalLink className="size-3" data-icon="inline-end" />
            </a>
          </Button>
          {homepage ? (
            <Button asChild variant="outline" size="sm" className="rounded-none">
              <a href={homepage} target="_blank" rel="noreferrer">
                项目主页
                <ArrowUpRight className="size-3.5" data-icon="inline-end" />
              </a>
            </Button>
          ) : null}
          <FavoriteButton
            fullName={repo.fullName}
            authenticated={Boolean(me)}
            initialFavorited={Boolean(favorite?.favorited)}
            initialId={favorite?.id}
          />
          <Button asChild variant="ghost" size="sm" className="ml-auto rounded-none text-muted-foreground">
            <Link href="/repos">
              <ArrowLeft className="size-3.5" data-icon="inline-start" />
              返回列表
            </Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-8">
          <section className="border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground">
                Brief / README 摘要
              </h2>
              <a
                href={readme?.sourceUrl ?? `https://github.com/${repo.fullName}#readme`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-primary hover:underline"
              >
                查看原文
                <ArrowUpRight className="size-3" aria-hidden />
              </a>
            </div>
            <div className="px-4 py-4">
              {readme?.summary ? (
                <p className="max-w-3xl text-sm leading-relaxed text-foreground">{readme.summary}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  README 摘要暂不可用，可点击右上角链接查看原文。
                </p>
              )}
            </div>
          </section>

          {repo.topics.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Topics / 标签
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {repo.topics.slice(0, 12).map((topic) => (
                  <Link
                    key={topic}
                    href={`/repos?topic=${encodeURIComponent(topic)}`}
                    className="border border-border bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {topic}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[11px] text-muted-foreground">01</span>
                <h2 className="text-section font-semibold text-foreground">相关推荐</h2>
              </div>
              <Link
                href="/repos"
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-primary"
              >
                浏览全部
              </Link>
            </div>
            {similar.length === 0 ? (
              <EmptyState title="暂无相关推荐" description="索引完成后会基于分类与主题生成相似仓库。" />
            ) : (
              <div className="border border-border bg-background px-4">
                {similar.map((item, index) => (
                  <RepoRow key={item.id} repo={item} index={String(index + 1).padStart(2, '0')} />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="h-fit lg:sticky lg:top-20">
          <section className="border border-border bg-card">
            <div className="border-b border-border px-4 py-2.5">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground">
                Facts / 事实
              </h2>
            </div>
            <dl className="grid grid-cols-2 gap-px bg-border">
              <Fact label="Stars" value={repo.stars} />
              <Fact label="Forks" value={repo.forks} />
              <Fact label="Watchers" value={repo.watchers} />
              <Fact label="Open issues" value={repo.openIssues} />
            </dl>
            <dl className="flex flex-col gap-2.5 border-t border-border px-4 py-4 text-xs">
              {repo.language ? <MetaRow label="语言" value={repo.language} /> : null}
              {repo.license ? <MetaRow label="许可" value={repo.license} /> : null}
              {platform ? <MetaRow label="平台" value={platform} /> : null}
              {updatedAt ? <MetaRow label="最近更新" value={updatedAt} /> : null}
              {repo.defaultBranch ? <MetaRow label="默认分支" value={repo.defaultBranch} /> : null}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="border border-border bg-background px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
      {children}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card px-4 py-4">
      <dd className="font-display text-xl font-semibold tabular-nums text-foreground">
        {value.toLocaleString('zh-CN')}
      </dd>
      <dt className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground">{value}</dd>
    </div>
  );
}

function formatDate(value?: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/**
 * 只接受 http(s) 首页链接：GitHub 数据不可信，避免 javascript:/data: 等协议被点击执行。
 */
function safeHttpUrl(value?: string): string | null {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
