import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';

import EmptyState from '@/components/empty-state';
import PageHeader from '@/components/page-header';
import Pagination from '@/components/me/Pagination';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fetchMe, fetchMyComparisons } from '@/lib/api';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

function formatTime(value?: string): string {
  return value ? value.slice(0, 16).replace('T', ' ') : '—';
}

export default async function ComparisonsPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const me = await fetchMe();
  if (!me) {
    redirect('/login?next=/me/comparisons');
  }
  const currentPage = Math.max(Number(searchParams.page) || 1, 1);
  const data = await fetchMyComparisons(currentPage, PAGE_SIZE);
  const totalPages = Math.max(Math.ceil((data?.total ?? 0) / PAGE_SIZE), 1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        index="07"
        eyebrow="Comparison history"
        title="对比记录"
        description="打开记录可导出 Markdown、创建或撤销只读分享。"
        actions={
          <Button asChild variant="ghost" size="sm" className="rounded-lg">
            <Link href="/me">返回个人中心</Link>
          </Button>
        }
      />

      {data?.items.length ? (
        <div className="flex flex-col gap-2">
          {data.items.map((item, index) => (
            <Link
              key={item.id}
              href={`/me/comparisons/${item.id}`}
              className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <span className="pt-0.5 font-mono text-[10px] text-muted-foreground">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-mono text-[12px] font-medium text-foreground">
                  {item.repoKeys.join(' vs ')}
                </h2>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  {formatTime(item.createdAt)} · schema {item.schemaVersion}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em]',
                  item.shared
                    ? 'border-primary/40 bg-primary/5 text-primary'
                    : 'border-border bg-muted text-muted-foreground',
                )}
              >
                {item.shared ? '已分享' : '未分享'}
              </span>
              <ArrowUpRight
                className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              />
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="还没有对比记录"
          description="去对比工作台生成第一条可追溯的选型结论。"
          action={
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link href="/compare">去对比工作台</Link>
            </Button>
          }
        />
      )}
      <Pagination page={currentPage} totalPages={totalPages} base="/me/comparisons" />
    </div>
  );
}
