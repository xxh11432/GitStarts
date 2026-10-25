import { redirect } from 'next/navigation';

import ChatWorkspace, { type ChatSeedMessage } from '@/components/chat/ChatWorkspace';
import { fetchConversation, fetchMe, fetchMyConversations } from '@/lib/api';
import type { ChatRepo } from '@/lib/chat';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ q?: string | string[]; c?: string | string[] }>;
}

export default async function ChatPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const initialQuery = typeof sp.q === 'string' ? sp.q.slice(0, 4000) : '';

  const me = await fetchMe();
  if (!me) {
    const next = initialQuery ? `/chat?q=${encodeURIComponent(initialQuery)}` : '/chat';
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const rawConversationId = typeof sp.c === 'string' ? sp.c : '';
  const conversationId = /^\d+$/.test(rawConversationId) ? Number(rawConversationId) : null;

  const [conversations, detail] = await Promise.all([
    fetchMyConversations(1, 40),
    conversationId ? fetchConversation(conversationId) : Promise.resolve(null),
  ]);

  // 只回放用户与助手的可见消息；工具调用记录留在会话详情页，不在对话流里展开。
  const initialMessages: ChatSeedMessage[] = (detail?.messages ?? [])
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content ?? '',
      repos: Array.isArray(message.refs) ? (message.refs as ChatRepo[]) : undefined,
    }))
    .filter((message) => message.content.trim().length > 0);

  return (
    <ChatWorkspace
      key={`${detail?.conversation.id ?? 'new'}-${initialQuery ? 'q' : 'idle'}`}
      user={{ nickname: me.nickname ?? 'GitHub 用户', avatarUrl: me.avatarUrl }}
      conversations={conversations?.items ?? []}
      initialConversationId={detail?.conversation.id ?? null}
      initialTitle={detail?.conversation.title}
      initialMessages={initialMessages}
      initialQuery={initialQuery}
    />
  );
}
