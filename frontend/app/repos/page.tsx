import Link from 'next/link';
import FilterBar from '@/components/FilterBar';
import RepoCard from '@/components/RepoCard';
import { fetchMeta, fetchRepos } from '@/lib/api';

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

  const filters = { q, category, language, topic, platform, license, sort, order };
  const [result, meta] = await Promise.all([
    fetchRepos({ ...filters, page, size: PAGE_SIZE }),
    fetchMeta(),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const hasFilters = Boolean(q || category || language || topic || platform || license);
  const outOfRange = result.total > 0 && page > totalPages;
  const prevPage = page > totalPages ? totalPages : Math.max(1, page - 1);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title font-semibold text-ink">仓库列表</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            共 {result.total.toLocaleString('zh-CN')} 个仓库
            {hasFilters ? ' · 已应用筛选' : ''}
          </p>
        </div>
        <p className="text-xs text-ink-muted">平台、分类、语言与许可可组合筛选</p>
      </header>

      <FilterBar meta={meta} current={filters} />

      {result.items.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-surface px-4 py-12 text-center">
          <p className="text-sm text-ink-secondary">
            {outOfRange
              ? '该页没有数据，可能已超出总页数'
              : hasFilters
                ? '当前筛选条件下没有匹配的仓库'
                : '暂无数据，等待采集完成'}
          </p>
          {(hasFilters || outOfRange) && (
            <Link
              href={outOfRange ? pageHref(filters, totalPages) : '/repos'}
              className="mt-3 inline-block text-sm text-accent transition-colors hover:text-accent-hover"
            >
              {outOfRange ? '回到最后一页' : '清除筛选条件'}
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {result.items.map((repo) => (
            <RepoCard key={repo.id} repo={repo} />
          ))}
        </div>
      )}

      {result.total > 0 && (
        <nav className="flex items-center justify-between gap-3 border-t border-line pt-4 text-sm">
          <PageLink href={pageHref(filters, prevPage)} disabled={page <= 1}>
            上一页
          </PageLink>
          <span className="tabular-nums text-ink-muted">
            第 {Math.min(page, totalPages)} / {totalPages} 页
          </span>
          <PageLink href={pageHref(filters, page + 1)} disabled={page >= totalPages}>
            下一页
          </PageLink>
        </nav>
      )}
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
      <span className="rounded-md border border-line px-3 py-1.5 text-ink-muted opacity-60" aria-disabled>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-md border border-line bg-background px-3 py-1.5 text-ink-secondary transition-colors hover:border-accent hover:text-accent"
    >
      {children}
    </Link>
  );
}
