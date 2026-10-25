'use client';

import { useState } from 'react';
import { Check, Download, TriangleAlert } from 'lucide-react';

import ConfidenceMeter, { EvidenceLink } from '@/components/confidence-meter';
import VerdictStamp from '@/components/verdict-stamp';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
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
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            Decision matrix
          </p>
          <h2 className="mt-1 text-section font-semibold text-foreground">对比矩阵</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {result.repos.length} 个仓库 · {result.dimensions.length} 个维度 · 每格证据可回溯
            {result.cached ? ' · 命中缓存' : ''}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={download} className="rounded-lg">
          <Download className="size-3.5" data-icon="inline-start" />
          导出 Markdown
        </Button>
      </div>

      {result.degraded ? (
        <Alert className="rounded-lg border-info/40 bg-info/5 px-4 py-3 text-info">
          <AlertDescription className="text-xs text-info">
            本次对比有部分仓库或维度降级为「信息不足」，建议打开原文人工确认。
          </AlertDescription>
        </Alert>
      ) : null}

      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground md:hidden">
        横向滑动查看全部仓库 →
      </p>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <caption className="sr-only">
            {result.repos.length} 个仓库在 {result.dimensions.length} 个维度上的对比矩阵，逐格列出结论、置信度与证据入口
          </caption>
          <thead>
            <tr className="border-b border-border bg-muted">
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 w-40 border-r border-border bg-muted px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
              >
                维度
              </th>
              {result.repos.map((repo) => {
                const recommended = result.verdict.recommended.includes(repo.fullName);
                return (
                  <th
                    key={repo.fullName}
                    scope="col"
                    className="sticky top-0 z-20 min-w-[210px] border-r border-border bg-muted px-4 py-3 align-top last:border-r-0"
                  >
                    <p className="break-words font-mono text-[12px] font-medium text-foreground">
                      {repo.fullName}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {[repo.language, repo.license].filter(Boolean).join(' · ') || '元数据不足'}
                    </p>
                    {recommended ? (
                      <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-primary">
                        <Check className="size-2.5" aria-hidden />
                        推荐
                      </span>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {result.dimensions.map((dimension, dimensionIndex) => {
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
                <tr
                  key={dimension.key}
                  className={cn(
                    'border-b border-border last:border-b-0',
                    hasDiff && 'bg-highlight/[0.06]',
                  )}
                >
                  <th
                    scope="row"
                    className={cn(
                      'sticky left-0 z-10 border-r border-border bg-card px-4 py-4 align-top',
                      hasDiff && 'border-l-2 border-l-highlight',
                    )}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[9px] text-muted-foreground">
                        {String(dimensionIndex + 1).padStart(2, '0')}
                      </span>
                      <span className="text-sm font-medium text-foreground">{dimension.label}</span>
                    </div>
                    {hasDiff ? (
                      <span className="mt-2 inline-block rounded-full border border-primary/30 bg-primary/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-primary">
                        差异
                      </span>
                    ) : null}
                  </th>
                  {rowCells.map((cell, index) => {
                    const repoKey = repoKeys[index];
                    if (!cell) {
                      return (
                        <td
                          key={repoKey}
                          className="border-r border-border px-4 py-4 align-top text-[11px] text-muted-foreground last:border-r-0"
                        >
                          信息不足
                        </td>
                      );
                    }
                    const insufficient = cell.value === '信息不足';
                    return (
                      <td
                        key={repoKey}
                        className={cn(
                          'border-r border-border px-4 py-4 align-top last:border-r-0',
                          hasDiff && !insufficient && 'bg-highlight/[0.08]',
                        )}
                      >
                        <p
                          className={cn(
                            'whitespace-pre-wrap text-[13px] leading-relaxed',
                            insufficient ? 'text-muted-foreground' : 'text-foreground',
                          )}
                        >
                          {cell.value}
                        </p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <ConfidenceMeter value={cell.confidence} />
                          <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                            {confidenceLabel(cell.confidence)}
                          </span>
                          {cell.evidence.length > 0 ? (
                            <EvidenceLink
                              count={cell.evidence.length}
                              onClick={() => setActive(cell)}
                            />
                          ) : (
                            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                              无证据
                            </span>
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

      <Sheet open={Boolean(active)} onOpenChange={(open) => !open && setActive(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {active ? (
            <>
              <SheetHeader className="text-left">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                  Exhibit / {active.dimensionKey}
                </p>
                <SheetTitle className="break-words font-mono text-base">{active.repoKey}</SheetTitle>
                <SheetDescription className="font-mono text-[10px] uppercase tracking-[0.1em]">
                  置信度 {confidenceLabel(active.confidence)} · {active.evidence.length} 条证据
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 flex flex-col gap-4">
                <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted px-3 py-2 text-sm leading-relaxed text-foreground">
                  {active.value}
                </p>
                {active.evidence.map((item, index) => (
                  <article key={`${item.section}-${index}`} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      <span className="text-foreground">
                        E{String(index + 1).padStart(2, '0')} · § {item.section}
                      </span>
                      <span className="rounded-full border border-border px-1.5 py-0.5">
                        {item.chunkType === 'manifest' ? 'manifest' : 'README'}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground">
                      {item.snippet}
                    </p>
                    {item.sourceUrl ? (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.1em] text-primary hover:underline"
                      >
                        查看原文 ↗
                      </a>
                    ) : null}
                  </article>
                ))}
                {active.evidence.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    该维度没有找到可引用的 README / manifest 片段，结论已标注为「信息不足」。
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function VerdictCard({ result }: { result: CompareResultView }) {
  const { verdict } = result;
  return (
    <section className="overflow-hidden rounded-xl border-2 border-primary/30 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
          Verdict / 结论建议
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          Evidence-based
        </span>
      </div>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {verdict.recommended.length > 0 ? (
            verdict.recommended.map((repoKey) => (
              <VerdictStamp key={repoKey} label={`推荐 ${repoKey}`} />
            ))
          ) : (
            <span className="text-sm text-muted-foreground">证据不足，暂不推荐</span>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {verdict.reasons.length > 0 ? (
            <div>
              <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Reasons / 理由
              </h3>
              <ul className="mt-2 flex flex-col gap-1.5 text-[12px] leading-relaxed text-foreground">
                {verdict.reasons.map((reason) => (
                  <li key={reason} className="flex gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {verdict.caveats.length > 0 ? (
            <div>
              <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Caveats / 风险与待确认
              </h3>
              <ul className="mt-2 flex flex-col gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
                {verdict.caveats.map((caveat) => (
                  <li key={caveat} className="flex gap-2">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
                    <span>{caveat}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <p className="border-t border-border pt-3 text-[10px] leading-relaxed text-muted-foreground">
          结论只基于仓库 README / manifest 证据；许可证、部署方式与功能边界请以原文为准。
        </p>
      </div>
    </section>
  );
}
