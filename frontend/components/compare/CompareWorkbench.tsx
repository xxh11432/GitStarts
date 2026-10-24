'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Plus, X } from 'lucide-react';

import CompareMatrix from './CompareMatrix';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { readBasket } from '@/lib/compare-basket';
import { COMPARE_STATE_KEY, readState, writeState } from '@/lib/workbench-storage';
import {
  CompareRequestError,
  shareComparison,
  streamCompare,
  type CompareCell,
  type CompareDone,
  type ComparePlan,
  type CompareResultView,
  type CompareVerdict,
  type ComparisonDetail,
} from '@/lib/compare';

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

interface CompareCache {
  repos: string[];
  rawText: string;
  ideaId: number | null;
  plan: ComparePlan | null;
  cells: Record<string, CompareCell>;
  verdict: CompareVerdict | null;
  done: CompareDone | null;
  shareUrl: string | null;
}

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
  initialRawText = '',
  initialComparison = null,
}: {
  initialRepos: string[];
  initialIdeaId: number | null;
  initialRawText?: string;
  initialComparison?: ComparisonDetail | null;
}) {
  const [repos, setRepos] = useState<string[]>(initialRepos);
  const [repoInput, setRepoInput] = useState('');
  const [rawText, setRawText] = useState(initialRawText);
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
  const [hydrated, setHydrated] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const dirtyRef = useRef(false);
  const busy = phase !== 'idle';
  const hasUrlSeed = initialRepos.length > 0 || initialIdeaId != null || initialRawText.trim().length > 0;

  // 没有 URL 参数时恢复上次对比；从匹配带仓库进来则视为一次新的对比。
  useEffect(() => {
    if (!hasUrlSeed) {
      const cached = readState<CompareCache>(COMPARE_STATE_KEY);
      if (cached) {
        setRepos(Array.isArray(cached.repos) ? cached.repos : []);
        setRawText(cached.rawText ?? '');
        setIdeaId(typeof cached.ideaId === 'number' ? cached.ideaId : null);
        setPlan(cached.plan ?? null);
        setCells(cached.cells ?? {});
        setVerdict(cached.verdict ?? null);
        setDone(cached.done ?? null);
        setShareUrl(cached.shareUrl ?? null);
      } else {
        const basket = readBasket();
        if (basket.length > 0) {
          setRepos(basket);
        }
      }
    } else if (initialRepos.length === 0 && !initialComparison) {
      // 从想法继续对比但没有历史结果时，用对比篮里的候选兜底，避免页面空白。
      const basket = readBasket();
      if (basket.length > 0) {
        setRepos(basket);
      }
    }
    setHydrated(true);
  }, [hasUrlSeed, initialRepos.length, initialComparison]);

  useEffect(() => {
    if (!hydrated || !dirtyRef.current) {
      return;
    }
    const timer = setTimeout(() => {
      writeState(COMPARE_STATE_KEY, {
        repos,
        rawText,
        ideaId,
        plan,
        cells,
        verdict,
        done,
        shareUrl,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [hydrated, repos, rawText, ideaId, plan, cells, verdict, done, shareUrl]);

  const markDirty = () => {
    dirtyRef.current = true;
  };

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
    markDirty();
    setRepos([...repos, key]);
    setRepoInput('');
  };

  const removeRepo = (key: string) => {
    markDirty();
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
    markDirty();
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
      markDirty();
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
  const ready = Object.keys(cells).length;

  return (
    <div className="flex flex-col gap-6">
      <section className="border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground">
            Case setup / 对比对象
          </h2>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {repos.length} / 4 selected
          </span>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {repos.map((repo) => (
                <span
                  key={repo}
                  className="inline-flex items-center gap-1.5 border border-border bg-background px-2.5 py-1 font-mono text-[11px] text-foreground"
                >
                  {repo}
                  <button
                    type="button"
                    onClick={() => removeRepo(repo)}
                    disabled={busy}
                    aria-label={`移除 ${repo}`}
                    className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              ))}
              {repos.length === 0 ? (
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  还没有选择仓库
                </p>
              ) : null}
            </div>

            <div className="flex gap-2">
              <Input
                value={repoInput}
                onChange={(event) => setRepoInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    addRepo(repoInput);
                  }
                }}
                disabled={busy || repos.length >= 4}
                placeholder="owner/name，例如 langgenius/dify"
                className="h-9 rounded-none font-mono text-[12px]"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addRepo(repoInput)}
                disabled={busy || !repoInput.trim() || repos.length >= 4}
                className="h-9 shrink-0 rounded-none"
              >
                <Plus className="size-3.5" data-icon="inline-start" />
                添加
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              支持直接输入 owner/name 或粘贴 GitHub 链接；一次最多对比 4 个仓库。
            </p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Label htmlFor="compare-requirement" className="text-sm font-semibold text-foreground">
                选型需求
              </Label>
              {ideaId ? (
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  使用匹配记录 #{ideaId} · 新描述会覆盖
                </span>
              ) : null}
            </div>
            <Textarea
              id="compare-requirement"
              value={rawText}
              onChange={(event) => {
                markDirty();
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
              className="min-h-[96px] resize-none rounded-none text-sm leading-relaxed"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="compare-force"
                  checked={force}
                  onCheckedChange={setForce}
                  disabled={busy}
                />
                <Label
                  htmlFor="compare-force"
                  className="text-[11px] font-normal text-muted-foreground"
                >
                  忽略缓存，重新生成
                </Label>
              </div>
              {phase === 'streaming' ? (
                <Button type="button" variant="outline" size="sm" onClick={stop} className="rounded-none">
                  停止
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="sm"
                  disabled={busy || repos.length < 2 || (!ideaId && !rawText.trim())}
                  className="rounded-none"
                >
                  开始对比
                  <ArrowUpRight className="size-3.5" data-icon="inline-end" />
                </Button>
              )}
            </div>
          </form>
        </div>
      </section>

      {error ? (
        <Alert
          variant="destructive"
          className="rounded-none border-destructive/40 bg-destructive/5 px-4 py-3"
        >
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      ) : null}

      {phase === 'streaming' ? (
        <div className="border border-border bg-card px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
              {plan ? 'Generating cells' : 'Preparing comparison'}
            </span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {plan ? `${ready} / ${expected} cells` : '—'}
            </span>
          </div>
          <Progress
            value={expected > 0 ? Math.round((ready / expected) * 100) : 0}
            className="mt-2 h-1.5 rounded-none bg-muted"
          />
        </div>
      ) : null}

      {initialComparison && !plan && phase === 'idle' ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border border-primary/40 bg-primary/5 px-4 py-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
              上次对比结果 · #{initialComparison.id}
            </span>
            <span className="text-[11px] text-muted-foreground">
              下方为上次生成的结果；修改仓库或需求后重新对比会生成新结果。
            </span>
          </div>
          <CompareMatrix result={initialComparison.result} />
        </section>
      ) : null}

      {result ? <CompareMatrix result={result} /> : null}

      {!plan && !done && phase === 'idle' && !error && !initialComparison ? (
        <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
          {[
            ['01', '选择仓库', '2–4 个候选，支持 owner/name 或 GitHub 链接。'],
            ['02', '描述需求', '从匹配记录带入，或直接粘贴场景与硬条件。'],
            ['03', '生成档案', '8 维矩阵、逐格证据抽屉、可导出的结论。'],
          ].map(([step, title, detail]) => (
            <div key={step} className="bg-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Step {step}
              </p>
              <h3 className="mt-2 text-sm font-semibold text-foreground">{title}</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>
      ) : null}

      {done ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card px-4 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {done.tookMs} ms{done.cached ? ' · cached (not billed)' : ''}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {done.comparisonId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void share()}
                disabled={busy}
                className="rounded-none"
              >
                {phase === 'sharing' ? '生成分享链接…' : '生成只读分享链接'}
              </Button>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                结果未落库，暂不能分享
              </span>
            )}
            {shareUrl ? (
              <button
                type="button"
                onClick={() => {
                  window.open(shareUrl, '_blank', 'noopener,noreferrer');
                }}
                className="inline-flex items-center gap-1 border border-primary/40 bg-primary/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-primary hover:bg-primary/10"
              >
                {copied ? '已复制 · 打开分享' : '打开分享链接'}
                <ArrowUpRight className="size-3" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
