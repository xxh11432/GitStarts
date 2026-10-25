'use client';

import Link from 'next/link';
import { MessageSquare, Plus, X } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ConversationSummary } from '@/lib/types';

function groupByDate(items: ConversationSummary[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86_400_000;
  const buckets: { label: string; items: ConversationSummary[] }[] = [
    { label: '今天', items: [] },
    { label: '昨天', items: [] },
    { label: '更早', items: [] },
  ];
  for (const item of items) {
    const time = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
    const index = time >= today ? 0 : time >= yesterday ? 1 : 2;
    buckets[index].items.push(item);
  }
  return buckets.filter((bucket) => bucket.items.length > 0);
}

/** DeepSeek 式会话侧栏：新对话、按日期分组的会话、底部账号入口。 */
export default function ChatSidebar({
  conversations,
  activeId,
  user,
  onNewChat,
  onClose,
}: {
  conversations: ConversationSummary[];
  activeId?: number | null;
  user: { nickname: string; avatarUrl?: string };
  onNewChat: () => void;
  onClose?: () => void;
}) {
  const groups = groupByDate(conversations);

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/40">
      <div className="flex items-center gap-1.5 px-3 pb-1 pt-3">
        <button
          type="button"
          onClick={onNewChat}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:border-primary/40"
        >
          <Plus className="size-3.5" aria-hidden />
          新对话
        </button>
        {onClose ? (
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="关闭会话列表">
            <X className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="会话历史">
        {groups.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-muted-foreground">
            还没有会话，先问一句。
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mt-3">
              <p className="px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {group.label}
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = item.id === activeId;
                  return (
                    <li key={item.id}>
                      <Link
                        href={`/chat?c=${item.id}`}
                        onClick={onClose}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border px-2 py-2 text-[13px] transition-colors',
                          active
                            ? 'border-border bg-card text-foreground'
                            : 'border-transparent text-muted-foreground hover:bg-card/70 hover:text-foreground',
                        )}
                      >
                        <MessageSquare className="size-3.5 shrink-0 opacity-60" aria-hidden />
                        <span className="truncate">{item.title || `会话 #${item.id}`}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </nav>

      <div className="border-t border-border p-2">
        <Link
          href="/me"
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-card"
        >
          <Avatar className="size-7 rounded-md">
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
            <AvatarFallback className="rounded-md bg-primary text-[11px] text-primary-foreground">
              {user.nickname.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">{user.nickname}</p>
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              Signed in
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
