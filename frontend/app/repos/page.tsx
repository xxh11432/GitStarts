import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';

import EmptyState from '@/components/empty-state';
import FilterBar from '@/components/FilterBar';
import PageHeader from '@/components/page-header';
import RepoCard from '@/components/repo-card';
import RepoRow from '@/components/repo-row';
import { Button } from '@/components/ui/button';
import { fetchFavoriteStatuses, fetchMe, fetchMeta, fetchRepos } from '@/lib/api';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

const PAGE_SIZE = 20;

export default async function ReposPage({ searchParams }: PageProps) {
  const sp = searchParams ?? {};
  const value = (key: string) => (typeof sp[key] === 'string' ? (sp[key] as string) : undefined);

  const q = value('q');
  const category = value('category');
  const language = value('language');
  const topic = value('topic');
  const platform = value('platform');
  const license = value('license');
  const sort = value('sort');
  const order = value('order');

  const rawPage = typeof sp.page === 'string' ? parseInt(sp.page, 10) : 1;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const view = value('view') === 'list' ? 'list' : 'grid';
  const filters = { q, category, language, topic, platform, license, sort, order, view };
  const [result, meta, me] = await Promise.all([
    fetchRepos({ q, category, language, topic, platform, license, sort, order, page, size: PAGE_SIZE }),
    fetchMeta(),
    fetchMe(),
  ]);
  const favorites = me && result.items.length > 0
    ? await fetchFavoriteStatuses(result.items.map((repo) => repo.fullName))
    : null;

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const hasFilters = Boolean(q || category || language || topic || platform || license);
  const outOfRange = result.total > 0 && page > totalPages;
  const prevPage = page > totalPages ? totalPages : Math.max(1, page - 1);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        index="02"
        eyebrow="Repository index"
        title="仓库档案库"
        description="按平台、分类、语言与许可组合筛选；每条记录都能回到仓库原文核对。"
        meta={
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {result.total.toLocaleString('zh-CN')} records
            {hasFilters ? ' · filtered' : ' · indexed'}
          </p>
        }
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-lg">
            <Link href="/match">用需求找仓库</Link>
          </Button>
        }
      />

      <div className="grid gap-6 md:grid-cols-[248px_minmax(0,1fr)] lg:gap-8">
        <FilterBar meta={meta} current={filters} />

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Showing {result.items.length} of {result.total.toLocaleString('zh-CN')}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {hasFilters ? (
                <Link
                  href="/repos"
                  className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary hover:underline"
                >
                  重置筛选
                </Link>
              ) : null}
              <div className="inline-flex overflow-hidden rounded-lg border border-border">
                {[
                  { key: 'grid', label: '卡片' },
                  { key: 'list', label: '列表' },
                ].map((option) => (
                  <Link
                    key={option.key}
                    href={pageHref({ ...filters, view: option.key }, page)}
                    aria-current={view === option.key ? 'page' : undefined}
                    className={cn(
                      'px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors',
                      view === option.key
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {option.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {result.items.length === 0 ? (
            <EmptyState
              title={outOfRange ? '该页没有数据' : hasFilters ? '没有匹配的仓库' : '暂无仓库数据'}
              description={
                outOfRange
                  ? '当前页码超出总页数，可能筛选条件已经变化。'
                  : hasFilters
                    ? '试着放宽平台或许可条件，或减少关键词。'
                    : '等待采集任务完成后再浏览档案。'
              }
              action={
                hasFilters || outOfRange ? (
                  <Button asChild variant="outline" size="sm" className="rounded-lg">
                    <Link href={outOfRange ? pageHref(filters, totalPages) : '/repos'}>
                      {outOfRange ? '回到最后一页' : '清除筛选条件'}
                    </Link>
                  </Button>
                ) : null
              }
            />
          ) : view === 'grid' ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {result.items.map((repo) => (
                <RepoCard
                  key={repo.id}
                  repo={repo}
                  authenticated={Boolean(me)}
                  favorite={favorites?.[repo.fullName] ?? { favorited: false }}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-background px-4">
              {result.items.map((repo) => (
                <RepoRow key={repo.id} repo={repo} />
              ))}
            </div>
          )}

          {result.total > 0 ? (
            <nav
              className="flex items-center justify-between gap-3 border-t border-border pt-4 text-sm"
              aria-label="分页"
            >
              <PageLink href={pageHref(filters, prevPage)} disabled={page <= 1}>
                <ArrowLeft className="size-3.5" data-icon="inline-start" />
                上一页
              </PageLink>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Page {Math.min(page, totalPages)} / {totalPages}
              </span>
              <PageLink href={pageHref(filters, page + 1)} disabled={page >= totalPages}>
                下一页
                <ArrowRight className="size-3.5" data-icon="inline-end" />
              </PageLink>
            </nav>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type Filters = {
  q?: string;
  category?: string;
  language?: string;
  topic?: string;
  platform?: string;
  license?: string;
  sort?: string;
  order?: string;
  view?: string;
};

function pageHref(filters: Filters, page: number): string {
  if (page < 1) {
    return '/repos';
  }
  const qs = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      qs.set(key, value);
    }
  });
  qs.set('page', String(page));
  return `/repos?${qs.toString()}`;
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground opacity-50"
        aria-disabled
      >
        {children}
      </span>
    );
  }
  return (
    <Button asChild variant="outline" size="sm" className="rounded-lg">
      <Link href={href}>{children}</Link>
    </Button>
  );
}
