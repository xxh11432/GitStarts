import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import ConversationDeleteButton from '@/components/me/ConversationDeleteButton';
import PageHeader from '@/components/page-header';
import StreamingMarkdown from '@/components/StreamingMarkdown';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fetchConversation, fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';

const MODE_LABELS: Record<string, string> = {
  chat: 'AI 对话',
  match: '语义匹配',
  compare: '深度对比',
};

function formatTime(value?: string): string {
  return value ? value.slice(0, 16).replace('T', ' ') : '—';
}

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await fetchMe();
  if (!me) {
    redirect(`/login?next=/me/conversations/${id}`);
  }
  if (!/^\d+$/.test(id)) {
    notFound();
  }
  const detail = await fetchConversation(id);
  if (!detail) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        index="08.1"
        eyebrow="Conversation detail"
        title={detail.conversation.title || `会话 #${detail.conversation.id}`}
        description={`${MODE_LABELS[detail.conversation.mode] ?? detail.conversation.mode} · ${
          detail.conversation.messageCount
        } 条消息 · 更新于 ${formatTime(detail.conversation.updatedAt)}`}
        actions={
          <>
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link href={`/chat?c=${detail.conversation.id}`}>在对话中继续</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="rounded-lg">
              <Link href="/me/conversations">返回会话历史</Link>
            </Button>
            <ConversationDeleteButton conversationId={detail.conversation.id} />
          </>
        }
      />

      <div className="flex flex-col gap-3">
        {detail.messages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
            这条会话还没有消息。
          </p>
        ) : (
          detail.messages.map((message) => {
            const isUser = message.role === 'user';
            const isTool = message.role === 'tool';
            if (isUser) {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[88%] rounded-2xl border border-border bg-muted px-4 py-3">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                        Request
                      </span>
                      <span className="font-mono text-[9px] text-muted-foreground">
                        {formatTime(message.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                      {message.content ?? ''}
                    </p>
                  </div>
                </div>
              );
            }
            if (isTool) {
              return (
                <article key={message.id} className="rounded-lg border border-border bg-muted/50 p-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                      Tool result
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground">
                      {formatTime(message.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {message.content ?? ''}
                  </p>
                </article>
              );
            }
            return (
              <article key={message.id} className={cn('overflow-hidden rounded-xl border border-border bg-card')}>
                <div className="flex items-baseline justify-between gap-4 border-b border-border px-4 py-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">
                    Analysis / AI
                  </span>
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {formatTime(message.createdAt)}
                  </span>
                </div>
                <div className="p-4">
                  <StreamingMarkdown content={message.content ?? ''} />
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
