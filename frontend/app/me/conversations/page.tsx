import Link from 'next/link';
import { redirect } from 'next/navigation';
import { fetchMe, fetchMyConversations } from '@/lib/api';

export const dynamic = 'force-dynamic';

const MODE_LABELS: Record<string, string> = {
  chat: 'AI 对话',
  match: '语义匹配',
  compare: '深度对比',
};

function formatTime(value?: string): string {
  return value ? value.slice(0, 16).replace('T', ' ') : '—';
}

export default async function ConversationsPage() {
  const me = await fetchMe();
  if (!me) {
    redirect('/login?next=/me/conversations');
  }
  const page = await fetchMyConversations(1, 50);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-accent">会话历史</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">与 AI 的对话</h1>
          <p className="mt-2 text-sm text-ink-secondary">会话按账号保存，重新登录后仍可回看。</p>
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
              href={`/me/conversations/${item.id}`}
              className="block rounded-card border border-line bg-background p-4 shadow-card transition-colors hover:border-accent"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-ink">{item.title || `会话 #${item.id}`}</h2>
                  <p className="mt-1 text-[11px] text-ink-muted">
                    {MODE_LABELS[item.mode] ?? item.mode} · {item.messageCount} 条消息 · {formatTime(item.updatedAt)}
                  </p>
                </div>
                {item.ideaId ? (
                  <span className="shrink-0 rounded bg-surface px-2 py-0.5 text-[11px] text-ink-muted">
                    想法 #{item.ideaId}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="rounded-card border border-dashed border-line bg-surface p-6 text-sm text-ink-muted">
          还没有会话记录。回首页向 AI 描述你的需求，对话会自动保存。
        </p>
      )}
    </div>
  );
}
