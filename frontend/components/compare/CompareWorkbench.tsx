'use client';

import { useRef, useState, type FormEvent } from 'react';
import CompareMatrix from './CompareMatrix';
import {
  CompareRequestError,
  shareComparison,
  streamCompare,
  type CompareCell,
  type CompareDone,
  type ComparePlan,
  type CompareResultView,
  type CompareVerdict,
} from '@/lib/compare';

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

function normalizeRepoKey(value: string): string | null {
  const key = value.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, '');
  return REPO_PATTERN.test(key) ? key : null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export default function CompareWorkbench({
  initialRepos,
  initialIdeaId,
}: {
  initialRepos: string[];
  initialIdeaId: number | null;
}) {
  const [repos, setRepos] = useState<string[]>(initialRepos);
  const [repoInput, setRepoInput] = useState('');
  const [rawText, setRawText] = useState('');
  const [ideaId, setIdeaId] = useState<number | null>(initialIdeaId);
  const [force, setForce] = useState(false);
  const [plan, setPlan] = useState<ComparePlan | null>(null);
  const [cells, setCells] = useState<Record<string, CompareCell>>({});
  const [verdict, setVerdict] = useState<CompareVerdict | null>(null);
  const [done, setDone] = useState<CompareDone | null>(null);
  const [phase, setPhase] = useState<'idle' | 'streaming' | 'sharing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const busy = phase !== 'idle';

  const addRepo = (raw: string) => {
    const key = normalizeRepoKey(raw);
    if (!key) {
      setError('仓库格式应为 owner/name');
      return;
    }
    if (repos.some((item) => item.toLowerCase() === key.toLowerCase())) {
      setError('这个仓库已经在对比列表里');
      return;
    }
    if (repos.length >= 4) {
      setError('一次最多对比 4 个仓库');
      return;
    }
    setError(null);
    setRepos([...repos, key]);
    setRepoInput('');
  };

  const removeRepo = (key: string) => {
    setRepos(repos.filter((item) => item !== key));
  };

  const reset = () => {
    setPlan(null);
    setCells({});
    setVerdict(null);
    setDone(null);
    setError(null);
    setShareUrl(null);
    setCopied(false);
  };

  const run = async () => {
    if (repos.length < 2 || repos.length > 4) {
      setError('请选择 2–4 个仓库');
      return;
    }
    if (!ideaId && !rawText.trim()) {
      setError('请先描述需求，或从匹配结果进入');
      return;
    }
    reset();
    setPhase('streaming');

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamCompare(
        {
          ideaId: ideaId ?? undefined,
          rawText: ideaId ? undefined : rawText.trim(),
          repoKeys: repos,
          force,
        },
        {
          onPlan: (next) => setPlan(next),
          onCell: (cell) =>
            setCells((current) => ({ ...current, [`${cell.dimensionKey}::${cell.repoKey}`]: cell })),
          onVerdict: (next) => setVerdict(next),
          onDone: (next) => setDone(next),
          onError: (event) => setError(event.message),
        },
        controller.signal,
      );
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      setError(err instanceof CompareRequestError ? err.message : '网络异常，请稍后重试');
    } finally {
      abortRef.current = null;
      setPhase('idle');
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!busy) {
      void run();
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase('idle');
  };

  const share = async () => {
    if (!done?.comparisonId || busy) {
      return;
    }
    setPhase('sharing');
    setError(null);
    try {
      const token = await shareComparison(done.comparisonId);
      const url = `${window.location.origin}/compare/s/${token}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    } catch (err) {
      setError(err instanceof CompareRequestError ? err.message : '分享失败，请稍后重试');
    } finally {
      setPhase('idle');
    }
  };

  const result: CompareResultView | null =
    plan && verdict
      ? {
          schemaVersion: plan.schemaVersion,
          dimensions: plan.dimensions,
          repos: plan.repos,
          cells: Object.values(cells),
          verdict,
          generatedAt: done?.generatedAt ?? new Date().toISOString(),
          comparisonId: done?.comparisonId ?? null,
          cached: done?.cached ?? plan.cached,
        }
      : null;

  const expected = plan ? plan.dimensions.length * plan.repos.length : 0;

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-line bg-background p-4 shadow-card">
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">对比对象</h2>
            <p className="mt-1 text-xs text-ink-muted">2–4 个 GitHub 仓库，直接输入 owner/name 或粘贴链接</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {repos.map((repo) => (
              <span
                key={repo}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink-secondary"
              >
                {repo}
                <button
                  type="button"
                  onClick={() => removeRepo(repo)}
                  disabled={busy}
                  aria-label={`移除 ${repo}`}
                  className="text-ink-muted hover:text-danger disabled:opacity-50"
                >
                  ×
                </button>
              </span>
            ))}
            {repos.length === 0 && <p className="text-xs text-ink-muted">还没有选择仓库</p>}
          </div>
          <div className="flex gap-2">
            <input
              value={repoInput}
              onChange={(event) => setRepoInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  addRepo(repoInput);
                }
              }}
              disabled={busy || repos.length >= 4}
              placeholder="langgenius/dify"
              className="min-w-0 flex-1 rounded-md border border-line bg-background px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => addRepo(repoInput)}
              disabled={busy || !repoInput.trim() || repos.length >= 4}
              className="rounded-md border border-line bg-background px-3 py-2 text-sm text-ink-secondary transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              添加
            </button>
          </div>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-3 border-t border-line pt-4">
          <label htmlFor="compare-requirement" className="block text-sm font-semibold text-ink">
            选型需求
          </label>
          {ideaId ? (
            <p className="text-xs text-ink-muted">
              使用匹配记录 #{ideaId} 的结构化需求；如需换需求，可粘贴新描述（新描述会覆盖当前需求）。
            </p>
          ) : null}
          <textarea
            id="compare-requirement"
            value={rawText}
            onChange={(event) => {
              setRawText(event.target.value);
              if (event.target.value.trim()) {
                setIdeaId(null);
              }
            }}
            rows={3}
            maxLength={4000}
            disabled={busy}
            placeholder={
              ideaId
                ? '可留空，直接使用匹配记录里的需求'
                : '例如：团队要私有部署知识库，必须支持 Docker 与中文全文检索'
            }
            className="w-full resize-none rounded-md border border-line bg-background px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none disabled:opacity-70"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <input
                type="checkbox"
                checked={force}
                onChange={(event) => setForce(event.target.checked)}
                disabled={busy}
                className="h-3.5 w-3.5 accent-accent"
              />
              忽略缓存，重新生成
            </label>
            {phase === 'streaming' ? (
              <button
                type="button"
                onClick={stop}
                className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-secondary hover:text-ink"
              >
                停止
              </button>
            ) : (
              <button
                type="submit"
                disabled={busy || repos.length < 2 || (!ideaId && !rawText.trim())}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                开始对比
              </button>
            )}
          </div>
        </form>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-card border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}

      {phase === 'streaming' && (
        <div className="rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink-secondary">
          {plan ? `正在生成对比：${Object.keys(cells).length}/${expected} 格已就绪` : '正在准备对比…'}
        </div>
      )}

      {result && <CompareMatrix result={result} />}

      {done && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 text-xs text-ink-muted">
          <span>
            用时 {done.tookMs} ms{done.cached ? ' · 命中缓存（未计费）' : ''}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {done.comparisonId ? (
              <button
                type="button"
                onClick={() => void share()}
                disabled={busy}
                className="rounded-md border border-line bg-background px-3 py-1.5 text-xs text-ink-secondary transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {phase === 'sharing' ? '生成分享链接…' : '生成只读分享链接'}
              </button>
            ) : (
              <span>结果未落库，暂不能分享</span>
            )}
            {shareUrl && (
              <a
                href={shareUrl}
                className="rounded-md border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs text-accent hover:underline"
              >
                {copied ? '已复制分享链接' : '打开分享链接'}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
