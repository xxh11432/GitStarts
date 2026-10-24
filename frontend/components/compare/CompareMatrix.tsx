'use client';

import { useEffect, useState } from 'react';
import { comparisonMarkdown, type CompareCell, type CompareResultView } from '@/lib/compare';

function confidenceLabel(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function cellKey(dimensionKey: string, repoKey: string): string {
  return `${dimensionKey}::${repoKey}`;
}

export default function CompareMatrix({ result }: { result: CompareResultView }) {
  const [active, setActive] = useState<CompareCell | null>(null);
  const repoKeys = result.repos.map((repo) => repo.fullName);
  const cells = new Map<string, CompareCell>();
  result.cells.forEach((cell) => cells.set(cellKey(cell.dimensionKey, cell.repoKey), cell));

  useEffect(() => {
    if (!active) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActive(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);

  const download = () => {
    const blob = new Blob([comparisonMarkdown(result)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `gitstars-compare-${Date.now()}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-live="polite" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">对比矩阵</h2>
          <p className="mt-1 text-xs text-ink-muted">
            {result.repos.length} 个仓库 · {result.dimensions.length} 个维度 · 每格证据可回溯
            {result.cached ? ' · 命中缓存' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={download}
          className="rounded-md border border-line bg-background px-3 py-1.5 text-sm text-ink-secondary transition-colors hover:border-accent hover:text-accent"
        >
          导出 Markdown
        </button>
      </div>

      {result.degraded && (
        <p className="rounded-card border border-line bg-surface px-4 py-3 text-xs text-ink-muted">
          本次对比有部分仓库或维度降级为「信息不足」，建议打开原文人工确认。
        </p>
      )}

      <div className="overflow-x-auto rounded-card border border-line bg-background shadow-card">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="sticky left-0 z-10 w-40 bg-surface px-4 py-3 text-xs font-semibold text-ink-secondary">
                维度
              </th>
              {result.repos.map((repo) => (
                <th key={repo.fullName} className="min-w-[200px] px-4 py-3 align-top">
                  <p className="text-sm font-semibold text-ink">{repo.fullName}</p>
                  <p className="mt-1 text-[11px] font-normal text-ink-muted">
                    {[repo.language, repo.license].filter(Boolean).join(' · ') || '元数据不足'}
                  </p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.dimensions.map((dimension) => {
              const rowCells = repoKeys.map((repoKey) =>
                cells.get(cellKey(dimension.key, repoKey)),
              );
              const values = new Set(
                rowCells
                  .map((cell) => cell?.value?.trim())
                  .filter((value): value is string => Boolean(value) && value !== '信息不足'),
              );
              const hasDiff = values.size > 1;
              return (
                <tr key={dimension.key} className="border-b border-line last:border-0">
                  <th className="sticky left-0 z-10 bg-background px-4 py-4 align-top text-sm font-medium text-ink">
                    {dimension.label}
                    {hasDiff && (
                      <span className="ml-2 rounded-full border border-accent/30 bg-accent/5 px-1.5 py-0.5 text-[10px] font-normal text-accent">
                        差异
                      </span>
                    )}
                  </th>
                  {rowCells.map((cell, index) => {
                    const repoKey = repoKeys[index];
                    if (!cell) {
                      return (
                        <td key={repoKey} className="px-4 py-4 text-xs text-ink-muted">
                          信息不足
                        </td>
                      );
                    }
                    const insufficient = cell.value === '信息不足';
                    return (
                      <td
                        key={repoKey}
                        className={`px-4 py-4 align-top ${hasDiff && !insufficient ? 'bg-accent/[0.03]' : ''}`}
                      >
                        <p
                          className={`whitespace-pre-wrap text-sm leading-relaxed ${
                            insufficient ? 'text-ink-muted' : 'text-ink-secondary'
                          }`}
                        >
                          {cell.value}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
                          <span>置信度 {confidenceLabel(cell.confidence)}</span>
                          {cell.evidence.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => setActive(cell)}
                              className="rounded-full border border-line bg-surface px-2 py-0.5 text-ink-secondary transition-colors hover:border-accent hover:text-accent"
                            >
                              证据 {cell.evidence.length}
                            </button>
                          ) : (
                            <span>无证据</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <VerdictCard result={result} />
      {active && <EvidenceDrawer cell={active} onClose={() => setActive(null)} />}
    </section>
  );
}

function VerdictCard({ result }: { result: CompareResultView }) {
  const { verdict } = result;
  return (
    <section className="rounded-card border border-line bg-background p-5 shadow-card">
      <h2 className="text-base font-semibold text-ink">结论建议</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {verdict.recommended.length > 0 ? (
          verdict.recommended.map((repoKey) => (
            <span
              key={repoKey}
              className="rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-sm font-medium text-accent"
            >
              推荐 {repoKey}
            </span>
          ))
        ) : (
          <span className="text-sm text-ink-muted">证据不足，暂不推荐</span>
        )}
      </div>
      {verdict.reasons.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">理由</h3>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink-secondary">
            {verdict.reasons.map((reason) => (
              <li key={reason} className="flex gap-2">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {verdict.caveats.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            风险与待确认
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink-secondary">
            {verdict.caveats.map((caveat) => (
              <li key={caveat} className="flex gap-2">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
                <span>{caveat}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-ink-muted">
        结论只基于仓库 README / manifest 证据；许可证、部署方式与功能边界请以原文为准。
      </p>
    </section>
  );
}

function EvidenceDrawer({ cell, onClose }: { cell: CompareCell; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="关闭证据抽屉"
        onClick={onClose}
        className="absolute inset-0 bg-ink/20"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${cell.repoKey} 的 ${cell.dimensionKey} 证据`}
        className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-background shadow-card"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-accent">{cell.dimensionKey}</p>
            <h3 className="mt-1 text-base font-semibold text-ink">{cell.repoKey}</h3>
            <p className="mt-1 text-xs text-ink-muted">
              置信度 {confidenceLabel(cell.confidence)} · {cell.evidence.length} 条证据
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line px-2 py-1 text-xs text-ink-secondary hover:border-accent hover:text-accent"
          >
            关闭
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="whitespace-pre-wrap rounded-card border border-line bg-surface px-3 py-2 text-sm leading-relaxed text-ink-secondary">
            {cell.value}
          </p>
          {cell.evidence.map((item, index) => (
            <article
              key={`${item.section}-${index}`}
              className="rounded-card border border-line bg-background px-3 py-3"
            >
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
                <span className="font-medium text-ink-secondary">§ {item.section}</span>
                <span className="rounded-full border border-line bg-surface px-1.5 py-0.5">
                  {item.chunkType === 'manifest' ? 'manifest' : 'README'}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-ink-secondary">
                {item.snippet}
              </p>
              {item.sourceUrl && (
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-[11px] text-accent hover:underline"
                >
                  查看原文
                </a>
              )}
            </article>
          ))}
          {cell.evidence.length === 0 && (
            <p className="text-xs text-ink-muted">
              该维度没有找到可引用的 README / manifest 片段，结论已标注为「信息不足」。
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
