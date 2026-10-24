import Link from 'next/link';
import { redirect } from 'next/navigation';
import { fetchMe, fetchMyIdeas } from '@/lib/api';

export const dynamic = 'force-dynamic';

function formatTime(value?: string): string {
  return value ? value.slice(0, 16).replace('T', ' ') : '—';
}

export default async function IdeasPage() {
  const me = await fetchMe();
  if (!me) {
    redirect('/login?next=/me/ideas');
  }
  const page = await fetchMyIdeas(1, 50);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-accent">我的想法</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">结构化需求</h1>
          <p className="mt-2 text-sm text-ink-secondary">想法会被结构化保存，可直接带入匹配或对比。</p>
        </div>
        <Link href="/me" className="text-xs text-accent hover:underline">
          返回个人中心
        </Link>
      </div>

      {page?.items.length ? (
        <div className="space-y-3">
          {page.items.map((idea) => (
            <article key={idea.id} className="rounded-card border border-line bg-background p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-ink">{idea.title || `想法 #${idea.id}`}</h2>
                  <p className="mt-1 text-[11px] text-ink-muted">
                    版本 {idea.revision} · 更新于 {formatTime(idea.updatedAt)}
                  </p>
                </div>
                <Link
                  href={`/compare?ideaId=${idea.id}`}
                  className="rounded-md border border-accent/30 bg-accent/5 px-3 py-1 text-xs text-accent hover:border-accent"
                >
                  继续对比
                </Link>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-ink-secondary">
                {idea.rawText}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-card border border-dashed border-line bg-surface p-6 text-sm text-ink-muted">
          还没有保存的想法。去「语义匹配」描述你的需求即可自动沉淀。
        </p>
      )}
    </div>
  );
}
