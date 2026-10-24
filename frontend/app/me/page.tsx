import Link from 'next/link';
import { redirect } from 'next/navigation';
import QuotaBadge from '@/components/QuotaBadge';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';

const assets = [
  { title: '我的想法', description: '查看与编辑结构化过的需求，重新匹配候选', href: '/match' },
  { title: '对比记录', description: 'M5 上线后，这里会保存每次对比结论', href: '/compare' },
  { title: '收藏仓库', description: 'M6 上线后，收藏与备注会沉淀在这里', href: '/repos' },
  { title: '会话历史', description: 'M6 上线后，可回看与 AI 的对话', href: '/#composer' },
];

export default async function MePage() {
  const me = await fetchMe();
  if (!me) {
    redirect('/login?next=/me');
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-background p-5 shadow-card">
        {me.avatarUrl ? (
          <img
            src={me.avatarUrl}
            alt=""
            className="h-14 w-14 rounded-full border border-line"
          />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-xl text-ink-secondary">
            {(me.nickname ?? '我').slice(0, 1)}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-ink">{me.nickname ?? 'GitHub 用户'}</h1>
          <p className="mt-1 text-sm text-ink-muted">账号 ID：{me.id} · 通过 GitHub 登录</p>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <QuotaBadge initial={me.quota} />

        <section>
          <h2 className="mb-3 text-base font-semibold text-ink">我的资产</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {assets.map((asset) => (
              <Link
                key={asset.title}
                href={asset.href}
                className="rounded-card border border-line bg-background p-4 shadow-card transition-colors hover:border-accent"
              >
                <h3 className="text-sm font-medium text-ink">{asset.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">{asset.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
