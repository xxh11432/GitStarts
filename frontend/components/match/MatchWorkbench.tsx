'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import CandidateCard from './CandidateCard';
import ConditionEditor from './ConditionEditor';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  BASKET_CHANGE_EVENT,
  addReposToBasket,
  compareHref,
  readBasket,
} from '@/lib/compare-basket';
import { MATCH_STATE_KEY, clearState, readState, writeState } from '@/lib/workbench-storage';
import { cn } from '@/lib/utils';
import {
  MatchError,
  saveIdeaConditions,
  streamMatch,
  type MatchCandidate,
  type MatchStage,
  type Requirement,
} from '@/lib/match';

interface MatchCache {
  rawText: string;
  requirement: Requirement | null;
  candidates: MatchCandidate[];
  ideaId: number | null;
  meta: { total: number; tookMs: number; cached: boolean } | null;
}

const STAGES: { key: MatchStage; label: string; detail: string }[] = [
  { key: 'filtering', label: '抽取条件', detail: '只取你明确说过的硬条件' },
  { key: 'retrieving', label: '召回候选', detail: 'README 片段 + 关键词补充' },
  { key: 'reranking', label: '重排打分', detail: '四维契合度分解' },
];

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export default function MatchWorkbench() {
  const [rawText, setRawText] = useState('');
  const [requirement, setRequirement] = useState<Requirement | null>(null);
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [ideaId, setIdeaId] = useState<number | null>(null);
  const [phase, setPhase] = useState<'idle' | 'streaming' | 'saving'>('idle');
  const [stage, setStage] = useState<MatchStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ total: number; tookMs: number; cached: boolean } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [basket, setBasket] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const dirtyRef = useRef(false);
  const router = useRouter();
  const busy = phase !== 'idle';

  // 恢复上次匹配结果：在匹配 → 对比 → 返回匹配之间不丢失。
  useEffect(() => {
    const cached = readState<MatchCache>(MATCH_STATE_KEY);
    if (cached) {
      setRawText(cached.rawText ?? '');
      setRequirement(cached.requirement ?? null);
      setCandidates(Array.isArray(cached.candidates) ? cached.candidates : []);
      setIdeaId(typeof cached.ideaId === 'number' ? cached.ideaId : null);
      setMeta(cached.meta ?? null);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !dirtyRef.current) {
      return;
    }
    const timer = setTimeout(() => {
      writeState(MATCH_STATE_KEY, { rawText, requirement, candidates, ideaId, meta });
    }, 200);
    return () => clearTimeout(timer);
  }, [hydrated, rawText, requirement, candidates, ideaId, meta]);

  useEffect(() => {
    const sync = () => setBasket(readBasket());
    sync();
    window.addEventListener(BASKET_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(BASKET_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const markDirty = () => {
    dirtyRef.current = true;
  };

  const clearResults = () => {
    markDirty();
    setRawText('');
    setRequirement(null);
    setCandidates([]);
    setIdeaId(null);
    setMeta(null);
    setSelected([]);
    setError(null);
    clearState(MATCH_STATE_KEY);
  };

  const toggleSelected = (fullName: string) => {
    setSelected((current) => {
      if (current.includes(fullName)) {
        return current.filter((item) => item !== fullName);
      }
      if (current.length >= 4) {
        toast('一次最多选择 4 个候选');
        return current;
      }
      return [...current, fullName];
    });
  };

  const addSelectedToBasket = () => {
    if (selected.length === 0) {
      return;
    }
    const merged = addReposToBasket(selected);
    setBasket(merged);
    const accepted = selected.filter((name) => merged.includes(name)).length;
    if (accepted < selected.length) {
      toast(`已加入 ${accepted} 个候选，对比篮最多保留 4 个`);
    } else {
      toast(`已加入 ${accepted} 个候选到对比篮`);
    }
    setSelected([]);
  };

  const goCompare = () => {
    if (basket.length < 2) {
      toast('至少选择 2 个仓库才能开始对比');
      return;
    }
    router.push(compareHref(basket, ideaId));
  };

  const run = async (
    payload: { rawText?: string; ideaId?: number | null; structured?: Requirement },
    resetConditions: boolean,
  ) => {
    markDirty();
    setError(null);
    setMeta(null);
    setCandidates([]);
    if (resetConditions) {
      setRequirement(null);
      setIdeaId(null);
    }
    setPhase('streaming');
    setStage('filtering');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamMatch(
        payload,
        {
          onParsed: (parsed, parsedIdeaId) => {
            setRequirement(parsed);
            if (typeof parsedIdeaId === 'number') {
              setIdeaId(parsedIdeaId);
            }
          },
          onStatus: (next) => setStage(next),
          onCandidate: (candidate) => setCandidates((current) => [...current, candidate]),
          onDone: (done) => {
            setMeta({ total: done.total, tookMs: done.tookMs, cached: done.cached });
            if (typeof done.ideaId === 'number') {
              setIdeaId(done.ideaId);
            }
          },
          onError: (event) => setError(event.message),
        },
        controller.signal,
      );
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      if (err instanceof MatchError) {
        setError(err.message);
      } else {
        setError('网络异常，请检查连接后重试');
      }
    } finally {
      abortRef.current = null;
      setPhase('idle');
      setStage(null);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = rawText.trim();
    if (!text || busy) {
      return;
    }
    void run({ rawText: text }, true);
  };

  const applyConditions = async () => {
    if (!requirement || !ideaId || busy) {
      return;
    }
    setError(null);
    setCandidates([]);
    setMeta(null);
    setPhase('saving');
    try {
      await saveIdeaConditions(ideaId, requirement);
      await run({ ideaId, structured: requirement }, false);
    } catch (err) {
      setError(err instanceof MatchError ? err.message : '保存条件失败，请稍后重试');
      setPhase('idle');
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase('idle');
    setStage(null);
  };

  const activeStage = stage ? STAGES.findIndex((item) => item.key === stage) : -1;
  const canRetry = !busy && error !== null && rawText.trim().length > 0;

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={submit}
        className="overflow-hidden rounded-xl border border-border bg-card shadow-hard transition-colors focus-within:border-primary/60"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
          <label
            htmlFor="match-input"
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
          >
            Request intake / 描述需求
          </label>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {rawText.length}/4000
          </span>
        </div>
        <Textarea
          id="match-input"
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          rows={4}
          maxLength={4000}
          disabled={busy}
          placeholder="例如：我们想私有部署一个中文全文检索知识库，必须支持 Docker 和 MIT 许可，最好有活跃维护"
          className="min-h-[120px] resize-none rounded-lg border-0 bg-transparent px-4 py-3 text-body text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0 disabled:opacity-70"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            条件只来自你的描述；信息不足处会标注「无法确认」。
          </p>
          {phase === 'streaming' ? (
            <Button type="button" variant="outline" size="sm" onClick={stop} className="rounded-lg">
              停止
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={!rawText.trim() || busy} className="rounded-lg">
              {candidates.length > 0 ? '重新分析描述' : '开始匹配'}
              <ArrowUpRight className="size-3.5" data-icon="inline-end" />
            </Button>
          )}
        </div>
      </form>

      {error ? (
        <Alert
          variant="destructive"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-destructive/40 bg-destructive/5 px-4 py-3"
        >
          <AlertDescription className="text-xs">{error}</AlertDescription>
          {canRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void run({ rawText: rawText.trim() }, true)}>
              <RotateCcw className="size-3.5" data-icon="inline-start" />
              重试
            </Button>
          ) : null}
        </Alert>
      ) : null}

      {phase === 'streaming' || phase === 'saving' ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {STAGES.map((item, index) => {
              const isActive = phase === 'saving' ? false : index === activeStage;
              const isDone = phase === 'saving' ? index <= 2 : index < activeStage;
              return (
                <div key={item.key} className={cn('px-3 py-2.5', isActive && 'bg-muted')}>
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em]">
                    <span
                      aria-hidden
                      className={cn(
                        'size-1.5',
                        isDone ? 'bg-primary' : isActive ? 'animate-pulse bg-primary' : 'bg-border',
                      )}
                    />
                    <span className={isActive ? 'text-foreground' : 'text-muted-foreground'}>
                      {String(index + 1).padStart(2, '0')} {item.label}
                    </span>
                  </div>
                  <p className="mt-1 pl-3.5 text-[10px] text-muted-foreground">{item.detail}</p>
                </div>
              );
            })}
          </div>
          {phase === 'saving' ? (
            <p className="border-t border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
              Saving conditions / 正在保存条件…
            </p>
          ) : null}
        </div>
      ) : null}

      {requirement ? (
        <ConditionEditor
          requirement={requirement}
          onChange={(next) => {
            markDirty();
            setRequirement(next);
          }}
          onApply={() => void applyConditions()}
          disabled={busy}
        />
      ) : null}

      {meta || candidates.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {meta ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {meta.total} candidates · {meta.tookMs} ms{meta.cached ? ' · cached 10m' : ''}
              </span>
            ) : null}
            {candidates.length > 0 ? (
              <span className="text-[11px] text-muted-foreground">勾选 2–4 个候选可批量带入对比</span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selected.length > 0 ? (
              <>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  已选 {selected.length}/4
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSelectedToBasket}
                  className="rounded-lg"
                >
                  加入对比篮
                </Button>
              </>
            ) : null}
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              对比篮 {basket.length}/4
            </span>
            <Button
              type="button"
              size="sm"
              onClick={goCompare}
              disabled={basket.length < 2}
              className="rounded-lg"
            >
              去对比
              <ArrowUpRight className="size-3.5" data-icon="inline-end" />
            </Button>
            {requirement || candidates.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearResults}
                className="rounded-lg text-muted-foreground"
              >
                <Trash2 className="size-3.5" data-icon="inline-start" />
                清空结果
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {candidates.length > 0 ? (
        <section aria-live="polite" className="stagger flex flex-col gap-4">
          {candidates.map((candidate, index) => (
            <CandidateCard
              key={candidate.repo.fullName}
              candidate={candidate}
              ideaId={ideaId}
              index={index}
              selectable
              selected={selected.includes(candidate.repo.fullName)}
              onToggleSelect={() => toggleSelected(candidate.repo.fullName)}
            />
          ))}
        </section>
      ) : null}

      {!busy && requirement && candidates.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-5 py-10 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            No candidates
          </p>
          <h2 className="mt-2 text-section font-semibold text-foreground">没有找到符合条件的候选</h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
            可以放宽硬条件、减少排除词，或确认索引 worker 已完成 README 索引后再试。
          </p>
        </div>
      ) : null}

      {!busy && !requirement && !error ? (
        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
          {[
            ['01', '描述需求', '只抽取你明说的条件，不确定项会标注「无法确认」。'],
            ['02', '核对候选', '契合度四维分解，硬条件逐条给出满足状态。'],
            ['03', '带入对比', '挑 2–4 个候选，生成逐格证据矩阵与结论。'],
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
    </div>
  );
}
