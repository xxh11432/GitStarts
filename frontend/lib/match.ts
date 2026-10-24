import { CSRF_HEADER, PUBLIC_API_BASE, ensureCsrfToken, redirectToLogin } from './client';
import type { Repo } from './types';

export const MATCH_STREAM_PATH = '/ai/match';

export type ConditionValue = string | number | boolean | string[];

export interface MatchCondition {
  key: string;
  value: ConditionValue;
  note?: string;
}

export interface Requirement {
  goal: string;
  domain?: string | null;
  audience?: string | null;
  must: MatchCondition[];
  should: MatchCondition[];
  exclude: string[];
  degraded?: boolean;
  notes?: string[];
}

export type MatchStage = 'filtering' | 'retrieving' | 'reranking';

export type ConditionStatus = 'hit' | 'miss' | 'unknown';

export interface ConditionCheck {
  key: string;
  value: ConditionValue;
  status: ConditionStatus;
}

export interface FitBreakdownView {
  semantic: number;
  coverage: number;
  maintenance: number;
  license: number;
}

export interface MatchEvidence {
  section: string;
  snippet: string;
  sourceUrl?: string | null;
}

export interface MatchCandidate {
  repo: Repo;
  fit: number;
  breakdown: FitBreakdownView;
  reasons: string[];
  risks: string[];
  conditions: ConditionCheck[];
  evidence: MatchEvidence[];
  fitted: boolean;
}

export interface MatchDone {
  total: number;
  tookMs: number;
  ideaId?: number | null;
  cached: boolean;
}

export interface MatchErrorEvent {
  code: string;
  message: string;
}

export interface MatchHandlers {
  onParsed?: (requirement: Requirement, ideaId?: number | null) => void;
  onStatus?: (stage: MatchStage) => void;
  onCandidate?: (candidate: MatchCandidate) => void;
  onDone?: (done: MatchDone) => void;
  onError?: (event: MatchErrorEvent) => void;
}

export interface MatchPayload {
  ideaId?: number | null;
  rawText?: string;
  structured?: Requirement;
  limit?: number;
}

export class MatchError extends Error {
  constructor(
    message: string,
    readonly code = 'match_failed',
    readonly status = 0,
  ) {
    super(message);
    this.name = 'MatchError';
  }
}

/**
 * 消费 /ai/match 的 SSE：parsed / status / candidate / done / error。
 */
export async function streamMatch(
  body: MatchPayload,
  handlers: MatchHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(MATCH_STREAM_PATH, {
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
      redirectToLogin('/match');
      throw new MatchError('请先登录后再匹配', 'unauthorized', 401);
    }
    throw new MatchError(
      typeof payload.message === 'string' ? payload.message : `请求失败（${response.status}）`,
      typeof payload.code === 'string' ? payload.code : 'match_failed',
      response.status,
    );
  }

  if (!response.body) {
    throw new MatchError('浏览器不支持流式响应', 'stream_unsupported');
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

function drain(buffer: string, handlers: MatchHandlers): string {
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

function dispatch(block: string, handlers: MatchHandlers): void {
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
    case 'parsed': {
      const payload = data as { requirement: Requirement; ideaId?: number | null };
      handlers.onParsed?.(payload.requirement, payload.ideaId);
      break;
    }
    case 'status':
      handlers.onStatus?.((data as { stage: MatchStage }).stage);
      break;
    case 'candidate':
      handlers.onCandidate?.(data as MatchCandidate);
      break;
    case 'done':
      handlers.onDone?.(data as MatchDone);
      break;
    case 'error':
      handlers.onError?.(data as MatchErrorEvent);
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

/** 保存用户编辑后的结构化条件（PATCH /api/ideas/{id}，需要 CSRF）。 */
export async function saveIdeaConditions(
  ideaId: number,
  structured: Requirement,
): Promise<void> {
  const token = await ensureCsrfToken();
  const response = await fetch(`${PUBLIC_API_BASE}/ideas/${ideaId}`, {
    method: 'PATCH',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: token },
    body: JSON.stringify({ structured }),
  });
  if (!response.ok) {
    const payload = await readJson(response);
    if (response.status === 401) {
      redirectToLogin('/match');
    }
    throw new MatchError(
      typeof payload.message === 'string' ? payload.message : `保存条件失败（${response.status}）`,
      typeof payload.code === 'string' ? payload.code : 'idea_save_failed',
      response.status,
    );
  }
}
