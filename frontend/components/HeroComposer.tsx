'use client';

import { useRef, useState, type FormEvent } from 'react';
import RepoMiniCard from '@/components/RepoMiniCard';
import StreamingMarkdown from '@/components/StreamingMarkdown';
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

  const runTurn = async (text: string, base: UiMessage[]) => {
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
        { conversationId: conversationIdRef.current, messages: payload },
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
    void runTurn(userMessage.content, current.slice(0, end - 1));
  };

  const streaming = phase === 'streaming';
  const canRetry = !streaming && error !== null && messagesRef.current.some((m) => m.role === 'user');

  return (
    <div id="composer" className="mx-auto mt-8 w-full max-w-3xl text-left">
      {messages.length > 0 && (
        <div className="mb-4 space-y-4" aria-live="polite" aria-busy={streaming}>
          {messages.map((message, index) =>
            message.role === 'user' ? (
              <div key={index} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-card bg-surface px-4 py-2.5 text-sm leading-relaxed text-ink">
                  {message.content}
                </p>
              </div>
            ) : (
              <div
                key={index}
                className="rounded-card border border-line bg-background p-4 shadow-card"
              >
                {message.content ? (
                  <StreamingMarkdown content={message.content} />
                ) : streaming && index === messages.length - 1 ? (
                  <p className="text-sm text-ink-muted">{STATUS_TEXT[status ?? 'thinking']}</p>
                ) : null}

                {message.repos && message.repos.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {message.repos.map((repo) => (
                      <RepoMiniCard key={repo.fullName} repo={repo} />
                    ))}
                  </div>
                )}

                {message.stopped && (
                  <p className="mt-2 text-xs text-ink-muted">已停止生成</p>
                )}
              </div>
            ),
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-card border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          <span>{error}</span>
          {canRetry && (
            <button
              type="button"
              onClick={retry}
              className="rounded-md border border-danger/40 px-2 py-1 text-xs font-medium transition-colors hover:bg-danger/10"
            >
              重试
            </button>
          )}
        </div>
      )}

      <form
        onSubmit={submit}
        className="rounded-card border border-line bg-background p-3 shadow-card focus-within:border-accent"
      >
        <label htmlFor="idea-input" className="sr-only">
          描述你的需求
        </label>
        <textarea
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
          className="w-full resize-none border-0 bg-transparent px-2 py-1.5 text-body text-ink placeholder:text-ink-muted focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3 px-1 pt-2">
          <p className="text-xs text-ink-muted">
            AI 会检索仓库库并给出候选；许可证与部署方式请以项目仓库为准
          </p>
          {streaming ? (
            <button
              type="button"
              onClick={stop}
              className="shrink-0 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:text-ink"
            >
              停止
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {messages.length > 0 ? '继续提问' : '开始对话'}
            </button>
          )}
        </div>
      </form>
      <p className="mt-2 text-center text-xs text-ink-muted">
        Enter 发送，Shift + Enter 换行；回答基于站内仓库数据，信息不足时会明确说明
      </p>
    </div>
  );
}
