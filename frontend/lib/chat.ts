import { redirectToLogin } from './client';

export const CHAT_STREAM_PATH = '/ai/chat/stream';

export interface ChatRepo {
  fullName: string;
  description?: string;
  language?: string;
  license?: string;
  stars?: number;
  category?: string;
  platform?: string;
  pushedAt?: string;
  topics?: string[];
}

export interface ChatQuota {
  used: number;
  limit: number;
  remaining?: number;
}

export interface ChatMeta {
  conversationId?: number | null;
  requestId?: string;
  quota?: ChatQuota;
}

export type ChatStage = 'thinking' | 'answering' | 'calling_tool';

export interface ChatToolEvent {
  name: string;
  ok: boolean;
  tookMs: number;
}

export interface ChatDone {
  conversationId?: number | null;
  tookMs: number;
  tokensIn?: number;
  tokensOut?: number;
  refs?: number;
}

export interface ChatErrorEvent {
  code: string;
  message: string;
}

export interface ChatHandlers {
  onMeta?: (data: ChatMeta) => void;
  onStatus?: (stage: ChatStage) => void;
  onTool?: (data: ChatToolEvent) => void;
  onRepos?: (items: ChatRepo[]) => void;
  onDelta?: (text: string) => void;
  onDone?: (data: ChatDone) => void;
  onError?: (data: ChatErrorEvent) => void;
}

export interface ChatPayloadMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class ChatError extends Error {
  constructor(
    message: string,
    readonly code = 'chat_failed',
    readonly status = 0,
  ) {
    super(message);
    this.name = 'ChatError';
  }
}

/**
 * 消费 /ai/chat/stream 的 SSE：fetch ReadableStream + AbortController。
 * 事件契约：meta / status / tool / repos / delta / done / error。
 */
export async function streamChat(
  body: {
    conversationId?: number | null;
    ideaId?: number | null;
    messages: ChatPayloadMessage[];
    /** 同一轮的唯一标识；重试时必须复用，服务端据此幂等扣费 */
    turnId?: string;
    /** 重试同一轮时置 false，避免服务端重复落库用户消息 */
    persistUser?: boolean;
  },
  handlers: ChatHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(CHAT_STREAM_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const payload = await readJson(response);
    if (response.status === 401) {
      redirectToLogin('/');
      throw new ChatError('请先登录后再对话', 'unauthorized', 401);
    }
    throw new ChatError(
      typeof payload.message === 'string' ? payload.message : `请求失败（${response.status}）`,
      typeof payload.code === 'string' ? payload.code : 'chat_failed',
      response.status,
    );
  }

  if (!response.body) {
    throw new ChatError('浏览器不支持流式响应', 'stream_unsupported');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    buffer = drain(buffer, handlers);
  }
  buffer += decoder.decode();
  drain(`${buffer}\n\n`, handlers);
}

function drain(buffer: string, handlers: ChatHandlers): string {
  let rest = buffer;
  let index = rest.indexOf('\n\n');
  while (index >= 0) {
    const block = rest.slice(0, index);
    rest = rest.slice(index + 2);
    dispatch(block, handlers);
    index = rest.indexOf('\n\n');
  }
  return rest;
}

function dispatch(block: string, handlers: ChatHandlers): void {
  if (!block.trim()) {
    return;
  }
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) {
    return;
  }
  let data: unknown;
  try {
    data = JSON.parse(dataLines.join('\n'));
  } catch {
    return;
  }

  switch (event) {
    case 'meta':
      handlers.onMeta?.(data as ChatMeta);
      break;
    case 'status':
      handlers.onStatus?.((data as { stage: ChatStage }).stage);
      break;
    case 'tool':
      handlers.onTool?.(data as ChatToolEvent);
      break;
    case 'repos':
      handlers.onRepos?.((data as { items: ChatRepo[] }).items ?? []);
      break;
    case 'delta':
      handlers.onDelta?.((data as { text: string }).text ?? '');
      break;
    case 'done':
      handlers.onDone?.(data as ChatDone);
      break;
    case 'error':
      handlers.onError?.(data as ChatErrorEvent);
      break;
    default:
      break;
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload = await response.json();
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
