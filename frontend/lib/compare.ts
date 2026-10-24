import { CSRF_HEADER, PUBLIC_API_BASE, ensureCsrfToken, redirectToLogin } from './client';
import type { Repo } from './types';

export const COMPARE_STREAM_PATH = '/ai/compare';

export interface CompareDimension {
  key: string;
  label: string;
}

export interface CompareEvidence {
  section: string;
  snippet: string;
  sourceUrl?: string | null;
  chunkType?: string;
}

export interface CompareCell {
  dimensionKey: string;
  repoKey: string;
  value: string;
  evidence: CompareEvidence[];
  confidence: number;
}

export interface CompareVerdict {
  recommended: string[];
  reasons: string[];
  caveats: string[];
}

export interface CompareResultView {
  schemaVersion: string;
  dimensions: CompareDimension[];
  repos: Repo[];
  cells: CompareCell[];
  verdict: CompareVerdict;
  generatedAt: string;
  degraded?: boolean;
  comparisonId?: number | null;
  cached?: boolean;
}

export interface ComparePlan {
  dimensions: CompareDimension[];
  repos: Repo[];
  ideaId?: number | null;
  schemaVersion: string;
  cached: boolean;
}

export interface ComparisonSummary {
  id: number;
  repoKeys: string[];
  schemaVersion: string;
  shared: boolean;
  createdAt?: string;
}

export interface ComparisonDetail {
  id: number;
  ideaId?: number;
  repoKeys: string[];
  schemaVersion: string;
  result: CompareResultView;
  shareToken?: string;
  createdAt?: string;
}

export interface CompareDone {
  comparisonId?: number | null;
  cached: boolean;
  tookMs: number;
  generatedAt?: string;
}

export interface CompareErrorEvent {
  code: string;
  message: string;
}

export interface CompareHandlers {
  onPlan?: (plan: ComparePlan) => void;
  onCell?: (cell: CompareCell) => void;
  onVerdict?: (verdict: CompareVerdict) => void;
  onDone?: (done: CompareDone) => void;
  onError?: (event: CompareErrorEvent) => void;
}

export interface ComparePayload {
  ideaId?: number | null;
  rawText?: string;
  repoKeys: string[];
  force?: boolean;
}

export class CompareRequestError extends Error {
  constructor(
    message: string,
    readonly code = 'compare_failed',
    readonly status = 0,
  ) {
    super(message);
    this.name = 'CompareRequestError';
  }
}

/**
 * 消费 /ai/compare 的 SSE：plan / cell / verdict / done / error。
 */
export async function streamCompare(
  body: ComparePayload,
  handlers: CompareHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(COMPARE_STREAM_PATH, {
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
      redirectToLogin('/compare');
      throw new CompareRequestError('请先登录后再对比', 'unauthorized', 401);
    }
    throw new CompareRequestError(
      typeof payload.message === 'string' ? payload.message : `请求失败（${response.status}）`,
      typeof payload.code === 'string' ? payload.code : 'compare_failed',
      response.status,
    );
  }
  if (!response.body) {
    throw new CompareRequestError('浏览器不支持流式响应', 'stream_unsupported');
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

function drain(buffer: string, handlers: CompareHandlers): string {
  let rest = buffer;
  let index = rest.indexOf('\n\n');
  while (index >= 0) {
    dispatch(rest.slice(0, index), handlers);
    rest = rest.slice(index + 2);
    index = rest.indexOf('\n\n');
  }
  return rest;
}

function dispatch(block: string, handlers: CompareHandlers): void {
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
    case 'plan':
      handlers.onPlan?.(data as ComparePlan);
      break;
    case 'cell':
      handlers.onCell?.(data as CompareCell);
      break;
    case 'verdict':
      handlers.onVerdict?.(data as CompareVerdict);
      break;
    case 'done':
      handlers.onDone?.(data as CompareDone);
      break;
    case 'error':
      handlers.onError?.(data as CompareErrorEvent);
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

/** 生成只读分享 token（POST /api/comparisons/{id}/share，需要 CSRF）。 */
export async function shareComparison(comparisonId: number): Promise<string> {
  const token = await ensureCsrfToken();
  const response = await fetch(`${PUBLIC_API_BASE}/comparisons/${comparisonId}/share`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { [CSRF_HEADER]: token },
  });
  const payload = await readJson(response);
  if (!response.ok) {
    if (response.status === 401) {
      redirectToLogin('/compare');
    }
    throw new CompareRequestError(
      typeof payload.message === 'string' ? payload.message : `分享失败（${response.status}）`,
      typeof payload.code === 'string' ? payload.code : 'share_failed',
      response.status,
    );
  }
  if (typeof payload.token !== 'string' || !payload.token) {
    throw new CompareRequestError('分享链接生成失败', 'share_failed');
  }
  return payload.token;
}

export function comparisonMarkdown(result: CompareResultView): string {
  const repoKeys = result.repos.map((repo) => repo.fullName);
  const lines: string[] = [];
  lines.push(`# 仓库对比：${repoKeys.join(' vs ')}`);
  lines.push('');
  if (result.generatedAt) {
    lines.push(`生成时间：${result.generatedAt}`);
    lines.push('');
  }
  lines.push('## 对比矩阵');
  lines.push('');
  lines.push(`| 维度 | ${repoKeys.join(' | ')} |`);
  lines.push(`| --- | ${repoKeys.map(() => '---').join(' | ')} |`);
  for (const dimension of result.dimensions) {
    const cells = repoKeys.map((repoKey) => {
      const cell = result.cells.find(
        (item) => item.dimensionKey === dimension.key && item.repoKey === repoKey,
      );
      const value = cell?.value || '信息不足';
      const refs = cell?.evidence
        .map((item) => `${item.section}${item.sourceUrl ? `（${item.sourceUrl}）` : ''}`)
        .join('；');
      return refs ? `${value}〔证据：${refs}〕` : value;
    });
    lines.push(`| ${dimension.label} | ${cells.map(escapeCell).join(' | ')} |`);
  }
  lines.push('');
  lines.push('## 结论建议');
  lines.push('');
  if (result.verdict.recommended.length > 0) {
    lines.push(`推荐：${result.verdict.recommended.join('、')}`);
  } else {
    lines.push('推荐：证据不足，暂不推荐');
  }
  if (result.verdict.reasons.length > 0) {
    lines.push('');
    lines.push('理由：');
    result.verdict.reasons.forEach((reason) => lines.push(`- ${reason}`));
  }
  if (result.verdict.caveats.length > 0) {
    lines.push('');
    lines.push('风险与待确认：');
    result.verdict.caveats.forEach((caveat) => lines.push(`- ${caveat}`));
  }
  lines.push('');
  lines.push('> 结果由 AI 基于仓库 README / manifest 生成，许可证与部署细节请以原文为准。');
  return lines.join('\n');
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
