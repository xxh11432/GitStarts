'use client';

import { useRef, useState, type FormEvent } from 'react';
import CandidateCard from './CandidateCard';
import ConditionEditor from './ConditionEditor';
import {
  MatchError,
  saveIdeaConditions,
  streamMatch,
  type MatchCandidate,
  type MatchStage,
  type Requirement,
} from '@/lib/match';

const STAGE_TEXT: Record<MatchStage, string> = {
  filtering: '正在抽取条件并应用硬过滤…',
  retrieving: '正在召回 README 片段与关键词候选…',
  reranking: '正在重排并计算契合度…',
};

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

  const abortRef = useRef<AbortController | null>(null);
  const busy = phase !== 'idle';

  const run = async (
    payload: { rawText?: string; ideaId?: number | null; structured?: Requirement },
    resetConditions: boolean,
  ) => {
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

  return (
    <div className="space-y-6">
      <form
        onSubmit={submit}
        className="rounded-card border border-line bg-background p-4 shadow-card focus-within:border-accent"
      >
        <label htmlFor="match-input" className="sr-only">
          描述你想解决的问题
        </label>
        <textarea
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
          className="w-full resize-none border-0 bg-transparent px-1 py-1 text-body text-ink placeholder:text-ink-muted focus:outline-none disabled:opacity-70"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-2">
          <p className="text-xs leading-relaxed text-ink-muted">
            条件只来自你的描述；信息不足处会标注「无法确认」
          </p>
          {phase === 'streaming' ? (
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
              disabled={!rawText.trim() || busy}
              className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {candidates.length > 0 ? '重新分析描述' : '开始匹配'}
            </button>
          )}
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-card border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}

      {(phase === 'streaming' || phase === 'saving') && (
        <div className="rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink-secondary">
          {phase === 'saving'
            ? '正在保存条件…'
            : stage
              ? STAGE_TEXT[stage]
              : '正在准备匹配…'}
        </div>
      )}

      {requirement && (
        <ConditionEditor
          requirement={requirement}
          onChange={setRequirement}
          onApply={() => void applyConditions()}
          disabled={busy}
        />
      )}

      {meta && (
        <p className="text-xs text-ink-muted">
          共 {meta.total} 个候选 · 用时 {meta.tookMs} ms
          {meta.cached ? ' · 10 分钟内命中缓存' : ''}
        </p>
      )}

      {candidates.length > 0 && (
        <section aria-live="polite" className="space-y-4">
          {candidates.map((candidate) => (
            <CandidateCard
              key={candidate.repo.fullName}
              candidate={candidate}
              ideaId={ideaId}
            />
          ))}
        </section>
      )}

      {!busy && requirement && candidates.length === 0 && !error && (
        <div className="rounded-card border border-dashed border-line bg-surface px-5 py-8 text-center">
          <h2 className="text-sm font-semibold text-ink">没有找到符合条件的候选</h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-ink-muted">
            可以放宽硬条件、减少排除词，或确认索引 worker 已完成 README 索引后再试。
          </p>
        </div>
      )}
    </div>
  );
}
