import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';

import EmptyState from '@/components/empty-state';
import PageHeader from '@/components/page-header';
import Pagination from '@/components/me/Pagination';
import { Button } from '@/components/ui/button';
import { fetchMe, fetchMyConversations } from '@/lib/api';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

const MODE_LABELS: Record<string, string> = {
  chat: 'AI 对话',
  match: '语义匹配',
  compare: '深度对比',
};

function formatTime(value?: string): string {
  return value ? value.slice(0, 16).replace('T', ' ') : '—';
}

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const me = await fetchMe();
  if (!me) {
    redirect('/login?next=/me/conversations');
  }
  const currentPage = Math.max(Number(sp.page) || 1, 1);
  const data = await fetchMyConversations(currentPage, PAGE_SIZE);
  const totalPages = Math.max(Math.ceil((data?.total ?? 0) / PAGE_SIZE), 1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        index="08"
        eyebrow="Conversation history"
        title="与 AI 的对话"
        description="会话按账号保存，重新登录后仍可回看。"
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
              href={`/me/conversations/${item.id}`}
              className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <span className="pt-0.5 font-mono text-[10px] text-muted-foreground">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[13px] font-medium text-foreground">
                  {item.title || `会话 #${item.id}`}
                </h2>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  {MODE_LABELS[item.mode] ?? item.mode} · {item.messageCount} messages ·{' '}
                  {formatTime(item.updatedAt)}
                </p>
              </div>
              {item.ideaId ? (
                <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                  想法 #{item.ideaId}
                </span>
              ) : null}
              <ArrowUpRight
                className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              />
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="还没有会话记录"
          description="去 01 AI 对话提问，会话会自动保存。"
          action={
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link href="/chat">去 AI 对话</Link>
            </Button>
          }
        />
      )}
      <Pagination page={currentPage} totalPages={totalPages} base="/me/conversations" />
    </div>
  );
}
