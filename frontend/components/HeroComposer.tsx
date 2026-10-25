'use client';

import { useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, RotateCcw, Square } from 'lucide-react';

import RepoMiniCard from '@/components/RepoMiniCard';
import StreamingMarkdown from '@/components/StreamingMarkdown';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  ChatError,
  streamChat,
  type ChatPayloadMessage,
  type ChatRepo,
  type ChatStage,
} from '@/lib/chat';

interface UiMessage {
  role: 'user' | 'assistant';
  content: string;
  repos?: ChatRepo[];
  stopped?: boolean;
}

const STATUS_TEXT: Record<ChatStage, string> = {
  thinking: '正在思考…',
  calling_tool: '正在检索仓库…',
  answering: '正在生成回答…',
};

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

export default function HeroComposer() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<'idle' | 'streaming'>('idle');
  const [status, setStatus] = useState<ChatStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const messagesRef = useRef<UiMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<number | null>(null);

  const updateMessages = (next: UiMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  };

  const runTurn = async (text: string, base: UiMessage[], options: { persistUser?: boolean } = {}) => {
    const assistantIndex = base.length + 1;
    setError(null);
    updateMessages([...base, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setPhase('streaming');
    setStatus('thinking');

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
        if (err.status !== 401) {
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
      .every((message) => !message.content && !(message.repos?.length));
    void runTurn(userMessage.content, current.slice(0, end - 1), { persistUser });
  };

  const streaming = phase === 'streaming';
  const canRetry = !streaming && error !== null && messagesRef.current.some((m) => m.role === 'user');

  return (
    <div id="composer" className="w-full">
      {messages.length > 0 ? (
        <div
          className="mb-5 flex flex-col gap-4"
          aria-live="polite"
          aria-busy={streaming}
        >
          {messages.map((message, index) =>
            message.role === 'user' ? (
              <div key={index} className="flex justify-end">
                <div className="max-w-[88%] rounded-2xl border border-border bg-muted px-4 py-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                    Request
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {message.content}
                  </p>
                </div>
              </div>
            ) : (
              <article key={index} className="overflow-hidden rounded-xl border border-border bg-background">
                <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">
                    Analysis / 证据回答
                  </span>
                  {message.stopped ? (
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                      已停止
                    </span>
                  ) : null}
                </header>
                <div className="p-4">
                  {message.content ? (
                    <StreamingMarkdown content={message.content} />
                  ) : streaming && index === messages.length - 1 ? (
                    <p className="animate-pulse font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      {STATUS_TEXT[status ?? 'thinking']}
                    </p>
                  ) : null}

                  {message.repos && message.repos.length > 0 ? (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {message.repos.map((repo) => (
                        <RepoMiniCard key={repo.fullName} repo={repo} />
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ),
          )}
        </div>
      ) : null}

      {error ? (
        <Alert
          variant="destructive"
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border-destructive/40 bg-destructive/5 px-3 py-2"
        >
          <AlertDescription className="text-xs">{error}</AlertDescription>
          {canRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              <RotateCcw className="size-3.5" data-icon="inline-start" />
              重试
            </Button>
          ) : null}
        </Alert>
      ) : null}

      <form
        onSubmit={submit}
        className="overflow-hidden rounded-xl border border-border bg-card shadow-hard transition-colors focus-within:border-primary/60"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
          <label
            htmlFor="idea-input"
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
          >
            Request intake / 需求登记
          </label>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {input.length}/4000
          </span>
        </div>
        <Textarea
          id="idea-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          rows={3}
          maxLength={4000}
          placeholder="例如：帮我找一个可 Docker 自托管、MIT 协议的中文全文检索知识库"
          className="min-h-[96px] resize-none rounded-lg border-0 bg-transparent px-4 py-3 text-body text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Enter 发送 · Shift + Enter 换行 · 许可证与部署方式以仓库原文为准
          </p>
          {streaming ? (
            <Button type="button" variant="outline" size="sm" onClick={stop} className="shrink-0">
              <Square className="size-3.5" data-icon="inline-start" />
              停止
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={!input.trim()} className="shrink-0">
              {messages.length > 0 ? '继续提问' : '开始对话'}
              <ArrowUpRight className="size-3.5" data-icon="inline-end" />
            </Button>
          )}
        </div>
      </form>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        Answers are grounded in indexed README evidence · 信息不足时会明确说明
      </p>
    </div>
  );
}
