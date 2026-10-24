import Link from 'next/link';
import { redirect } from 'next/navigation';
import { fetchMe, fetchMyComparisons } from '@/lib/api';

export const dynamic = 'force-dynamic';

function formatTime(value?: string): string {
  return value ? value.slice(0, 16).replace('T', ' ') : '—';
}

export default async function ComparisonsPage() {
  const me = await fetchMe();
  if (!me) {
    redirect('/login?next=/me/comparisons');
  }
  const page = await fetchMyComparisons(1, 50);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-accent">对比历史</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">对比记录</h1>
          <p className="mt-2 text-sm text-ink-secondary">打开记录可导出 Markdown、创建或撤销只读分享。</p>
        </div>
        <Link href="/me" className="text-xs text-accent hover:underline">
          返回个人中心
        </Link>
      </div>

      {page?.items.length ? (
        <div className="space-y-3">
          {page.items.map((item) => (
            <Link
              key={item.id}
              href={`/me/comparisons/${item.id}`}
              className="block rounded-card border border-line bg-background p-4 shadow-card transition-colors hover:border-accent"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-ink">{item.repoKeys.join(' vs ')}</h2>
                  <p className="mt-1 text-[11px] text-ink-muted">
                    {formatTime(item.createdAt)} · schema {item.schemaVersion}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-[11px] ${
                    item.shared ? 'bg-accent/10 text-accent' : 'bg-surface text-ink-muted'
                  }`}
                >
                  {item.shared ? '已分享' : '未分享'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="rounded-card border border-dashed border-line bg-surface p-6 text-sm text-ink-muted">
          还没有对比记录。去
          <Link href="/compare" className="mx-1 text-accent hover:underline">
            对比工作台
          </Link>
          生成第一条结论。
        </p>
      )}
    </div>
  );
}
