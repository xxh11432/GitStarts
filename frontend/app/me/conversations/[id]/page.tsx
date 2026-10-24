import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import ConversationDeleteButton from '@/components/me/ConversationDeleteButton';
import StreamingMarkdown from '@/components/StreamingMarkdown';
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
  params: { id: string };
}) {
  const me = await fetchMe();
  if (!me) {
    redirect(`/login?next=/me/conversations/${params.id}`);
  }
  if (!/^\d+$/.test(params.id)) {
    notFound();
  }
  const detail = await fetchConversation(params.id);
  if (!detail) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest text-accent">会话详情</p>
          <h1 className="mt-2 truncate text-2xl font-semibold text-ink">
            {detail.conversation.title || `会话 #${detail.conversation.id}`}
          </h1>
          <p className="mt-2 text-sm text-ink-secondary">
            {MODE_LABELS[detail.conversation.mode] ?? detail.conversation.mode} ·{' '}
            {detail.conversation.messageCount} 条消息 · 更新于 {formatTime(detail.conversation.updatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/me/conversations" className="text-xs text-accent hover:underline">
            返回会话历史
          </Link>
          <ConversationDeleteButton conversationId={detail.conversation.id} />
        </div>
      </div>

      <div className="space-y-3">
        {detail.messages.length === 0 ? (
          <p className="rounded-card border border-dashed border-line bg-surface p-6 text-sm text-ink-muted">
            这条会话还没有消息。
          </p>
        ) : (
          detail.messages.map((message) => {
            const isUser = message.role === 'user';
            const isTool = message.role === 'tool';
            return (
              <article
                key={message.id}
                className={`rounded-card border p-4 shadow-card ${
                  isUser
                    ? 'border-accent/30 bg-accent/5'
                    : isTool
                      ? 'border-line bg-surface'
                      : 'border-line bg-background'
                }`}
              >
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className={`text-xs font-medium ${isUser ? 'text-accent' : 'text-ink-secondary'}`}>
                    {isUser ? '我' : isTool ? '工具结果' : 'AI'}
                  </span>
                  <span className="text-[11px] text-ink-muted">{formatTime(message.createdAt)}</span>
                </div>
                {isUser || isTool ? (
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
                    {message.content ?? ''}
                  </p>
                ) : (
                  <StreamingMarkdown content={message.content ?? ''} />
                )}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
