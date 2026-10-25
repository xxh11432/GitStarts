'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, Check, Copy, Menu, RotateCcw, Sparkles, Square } from 'lucide-react';

import ChatSidebar from '@/components/chat/ChatSidebar';
import RepoMiniCard from '@/components/RepoMiniCard';
import StreamingMarkdown from '@/components/StreamingMarkdown';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  ChatError,
  streamChat,
  type ChatPayloadMessage,
  type ChatQuota,
  type ChatRepo,
  type ChatStage,
} from '@/lib/chat';
import { redirectToLogin } from '@/lib/client';
import type { ConversationSummary } from '@/lib/types';

export interface ChatSeedMessage {
  role: 'user' | 'assistant';
  content: string;
  repos?: ChatRepo[];
}

interface UiMessage extends ChatSeedMessage {
  stopped?: boolean;
}

interface ChatWorkspaceProps {
  user: { nickname: string; avatarUrl?: string };
  conversations: ConversationSummary[];
  initialConversationId?: number | null;
  initialTitle?: string;
  initialMessages: ChatSeedMessage[];
  /** 首页带入的问题：进入页面后自动发出 */
  initialQuery?: string;
}

const STATUS_TEXT: Record<ChatStage, string> = {
  thinking: '正在思考…',
  calling_tool: '正在检索仓库档案…',
  answering: '正在生成回答…',
};

const SUGGESTIONS = [
  '帮我找一个可 Docker 自托管的中文知识库',
  '有没有 MIT 协议、能私有化部署的监控面板？',
  '适合小团队的本地 AI 笔记工具有哪些？',
  '推荐几个近期活跃的 Go 语言消息队列',
];

function mergeRepos(current: ChatRepo[] | undefined, incoming: ChatRepo[]): ChatRepo[] {
  const merged = [...(current ?? [])];
  for (const repo of incoming) {
    if (!merged.some((item) => item.fullName === repo.fullName)) {
      merged.push(repo);
    }
  }
  return merged;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export default function ChatWorkspace({
  user,
  conversations,
  initialConversationId,
  initialTitle,
  initialMessages,
  initialQuery,
}: ChatWorkspaceProps) {
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<'idle' | 'streaming'>('idle');
  const [status, setStatus] = useState<ChatStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(initialTitle ?? null);
  const [activeId, setActiveId] = useState<number | null>(initialConversationId ?? null);
  const [quota, setQuota] = useState<ChatQuota | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  const messagesRef = useRef<UiMessage[]>(initialMessages);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<number | null>(initialConversationId ?? null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bootedRef = useRef(false);

  const updateMessages = (next: UiMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  };

  const runTurn = async (
    text: string,
    base: UiMessage[],
    options: { persistUser?: boolean } = {},
  ) => {
    const assistantIndex = base.length + 1;
    setError(null);
    setSidebarOpen(false);
    updateMessages([...base, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setPhase('streaming');
    setStatus('thinking');
    if (conversationIdRef.current === null) {
      setTitle(text.length > 26 ? `${text.slice(0, 26)}…` : text);
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const payload: ChatPayloadMessage[] = [
      ...base.map(({ role, content }) => ({ role, content })),
      { role: 'user' as const, content: text },
    ];

    try {
      await streamChat(
        {
          conversationId: conversationIdRef.current,
          messages: payload,
          persistUser: options.persistUser,
        },
        {
          onMeta: (meta) => {
            if (typeof meta.conversationId === 'number') {
              conversationIdRef.current = meta.conversationId;
              setActiveId(meta.conversationId);
              window.history.replaceState(null, '', `/chat?c=${meta.conversationId}`);
            }
            if (meta.quota) {
              setQuota(meta.quota);
            }
          },
          onStatus: (stage) => setStatus(stage),
          onTool: () => setStatus('calling_tool'),
          onRepos: (items) => {
            updateMessages(
              messagesRef.current.map((message, index) =>
                index === assistantIndex
                  ? { ...message, repos: mergeRepos(message.repos, items) }
                  : message,
              ),
            );
          },
          onDelta: (delta) => {
            updateMessages(
              messagesRef.current.map((message, index) =>
                index === assistantIndex
                  ? { ...message, content: message.content + delta }
                  : message,
              ),
            );
          },
          onError: (event) => setError(event.message),
        },
        controller.signal,
      );
    } catch (err) {
      if (isAbortError(err)) {
        updateMessages(
          messagesRef.current.map((message, index) =>
            index === assistantIndex ? { ...message, stopped: true } : message,
          ),
        );
      } else if (err instanceof ChatError) {
        if (err.status === 401) {
          redirectToLogin('/chat');
        } else {
          setError(err.message);
        }
      } else {
        setError('网络异常，请检查连接后重试');
      }
    } finally {
      abortRef.current = null;
      setPhase('idle');
      setStatus(null);
    }
  };

  // 首页带入的问题：进入页面后自动发出一次，随后清掉查询参数，避免刷新重复提问。
  useEffect(() => {
    if (bootedRef.current) {
      return;
    }
    bootedRef.current = true;
    if (!initialQuery || initialMessages.length > 0) {
      return;
    }
    window.history.replaceState(null, '', '/chat');
    void runTurn(initialQuery, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [input]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || phase === 'streaming') {
      return;
    }
    setInput('');
    void runTurn(text, messagesRef.current);
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase('idle');
    setStatus(null);
  };

  const retry = () => {
    const current = messagesRef.current;
    let end = current.length;
    while (end > 0 && current[end - 1].role === 'assistant') {
      end -= 1;
    }
    if (end === 0 || current[end - 1].role !== 'user') {
      return;
    }
    const userMessage = current[end - 1];
    // 已产生输出说明上一轮用户消息已落库，重试时不再重复写入
    const persistUser = current
      .slice(end)
      .every((message) => !message.content && !message.repos?.length);
    void runTurn(userMessage.content, current.slice(0, end - 1), { persistUser });
  };

  const startNewChat = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    conversationIdRef.current = null;
    updateMessages([]);
    setActiveId(null);
    setTitle(null);
    setError(null);
    setInput('');
    setSidebarOpen(false);
    setPhase('idle');
    setStatus(null);
    window.history.replaceState(null, '', '/chat');
  };

  const copyAnswer = async (index: number, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(index);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // 剪贴板不可用时静默失败，不打断对话
    }
  };

  const streaming = phase === 'streaming';
  const canRetry = !streaming && error !== null && messagesRef.current.some((m) => m.role === 'user');
  const remaining = quota ? (quota.remaining ?? Math.max(quota.limit - quota.used, 0)) : null;

  return (
    <div className="relative flex h-[calc(100dvh-3.5rem)] w-full overflow-hidden bg-background">
      <aside className="hidden w-[264px] shrink-0 border-r border-border md:block">
        <ChatSidebar
          conversations={conversations}
          activeId={activeId}
          user={user}
          onNewChat={startNewChat}
        />
      </aside>

      {sidebarOpen ? (
        <div className="absolute inset-0 z-30 flex md:hidden">
          <button
            type="button"
            aria-label="关闭会话列表"
            className="absolute inset-0 bg-foreground/30"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-10 h-full w-[82%] max-w-[300px] border-r border-border shadow-xl">
            <ChatSidebar
              conversations={conversations}
              activeId={activeId}
              user={user}
              onNewChat={startNewChat}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 sm:px-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="打开会话列表"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="size-4" aria-hidden />
          </Button>
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
            {title || '新对话'}
          </p>
          {remaining !== null ? (
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
              今日剩余 {remaining} 次
            </span>
          ) : null}
          <span className="hidden shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:inline-flex">
            <span aria-hidden className="size-1.5 bg-primary" />
            01 / AI 对话
          </span>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto" aria-live="polite" aria-busy={streaming}>
          {messages.length === 0 && !streaming ? (
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-5 py-10">
              <div className="flex flex-col items-start gap-5">
                <img src="/icon.svg" alt="" width={40} height={40} className="size-10 rounded-lg" />
                <div>
                  <h1 className="font-display text-2xl font-semibold text-foreground">
                    你好，我是 GitStars 助手
                  </h1>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    描述场景或硬条件，我会检索站内仓库档案，给出带证据的候选与取舍，并支持继续追问。
                    没有依据时会明确写「信息不足」。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void runTurn(suggestion, messagesRef.current)}
                      className="rounded-full border border-border bg-card px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-8 sm:px-5">
              {messages.map((message, index) => {
                if (message.role === 'user') {
                  return (
                    <div key={index} className="flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-2.5 text-sm leading-relaxed text-foreground">
                        {message.content}
                      </div>
                    </div>
                  );
                }
                const isLast = index === messages.length - 1;
                return (
                  <article key={index} className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      <span className="inline-flex size-5 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Sparkles className="size-3" aria-hidden />
                      </span>
                      GitStars
                      {message.stopped ? <span>· 已停止</span> : null}
                    </div>

                    {message.content ? (
                      <StreamingMarkdown content={message.content} />
                    ) : streaming && isLast ? (
                      <p className="animate-pulse font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        {STATUS_TEXT[status ?? 'thinking']}
                      </p>
                    ) : null}

                    {message.repos && message.repos.length > 0 ? (
                      <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {message.repos.map((repo) => (
                          <RepoMiniCard key={repo.fullName} repo={repo} />
                        ))}
                      </div>
                    ) : null}

                    {message.content && !streaming ? (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground"
                          aria-label="复制回答"
                          onClick={() => void copyAnswer(index, message.content)}
                        >
                          {copied === index ? (
                            <Check className="size-3.5" aria-hidden />
                          ) : (
                            <Copy className="size-3.5" aria-hidden />
                          )}
                        </Button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-background px-4 pb-3 pt-3 sm:px-5">
          {error ? (
            <div className="mx-auto mb-2 flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
              <p className="text-xs text-destructive">{error}</p>
              {canRetry ? (
                <Button type="button" variant="outline" size="sm" onClick={retry}>
                  <RotateCcw className="size-3.5" data-icon="inline-start" />
                  重试
                </Button>
              ) : null}
            </div>
          ) : null}

          <form onSubmit={submit} className="mx-auto w-full max-w-3xl">
            <div className="rounded-[1.6rem] border border-border bg-card p-2 shadow-hard transition-colors focus-within:border-primary/60">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder="描述你的场景或硬条件…"
                aria-label="输入问题"
                className="max-h-40 min-h-[44px] resize-none rounded-lg border-0 bg-transparent px-2.5 py-2 text-sm shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
              />
              <div className="flex items-center justify-between gap-2 px-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  Enter 发送 · Shift + Enter 换行
                </p>
                {streaming ? (
                  <Button
                    type="button"
                    size="icon"
                    className="size-8 rounded-full"
                    onClick={stop}
                    aria-label="停止生成"
                  >
                    <Square className="size-3.5" aria-hidden />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="icon"
                    className="size-8 rounded-full"
                    disabled={!input.trim()}
                    aria-label="发送"
                  >
                    <ArrowUp className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            </div>
          </form>

          <p className="mx-auto mt-2 max-w-3xl text-center font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
            内容由 AI 生成 · 许可证与部署方式请以仓库原文为准
          </p>
        </div>
      </section>
    </div>
  );
}
