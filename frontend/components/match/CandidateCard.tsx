'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, CircleHelp, X } from 'lucide-react';

import CompareAddButton from '@/components/compare/CompareAddButton';
import FitMeter from '@/components/fit-meter';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { platformLabel } from '@/lib/labels';
import type { ConditionStatus, MatchCandidate } from '@/lib/match';

const STATUS_META: Record<
  ConditionStatus,
  { label: string; icon: typeof Check; className: string }
> = {
  hit: { label: '满足', icon: Check, className: 'border-primary/40 bg-primary/5 text-primary' },
  miss: {
    label: '未满足',
    icon: X,
    className: 'border-destructive/40 bg-destructive/5 text-destructive',
  },
  unknown: {
    label: '无法确认',
    icon: CircleHelp,
    className: 'border-border bg-muted text-muted-foreground',
  },
};

function formatCount(value?: number): string {
  if (value === undefined) {
    return '';
  }
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

function formatValue(value: string | number | boolean | string[]): string {
  return Array.isArray(value) ? value.join(' / ') : String(value);
}

export default function CandidateCard({
  candidate,
  ideaId,
  index,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  candidate: MatchCandidate;
  ideaId?: number | null;
  index?: number;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const { repo } = candidate;
  const platform = platformLabel(repo.platform);
  const fitPercent = Math.round(candidate.fit * 100);

  return (
    <article className={cn('border bg-card', selected ? 'border-primary/60' : 'border-border')}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Candidate {String((index ?? 0) + 1).padStart(2, '0')}
        </span>
        <div className="flex items-center gap-3">
          {selectable ? (
            <label className="flex cursor-pointer items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              <Checkbox
                checked={selected}
                onCheckedChange={() => onToggleSelect?.()}
                aria-label={`选择 ${repo.fullName}`}
              />
              选择
            </label>
          ) : null}
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {candidate.fitted ? 'Reranked' : 'Retrieved'}
          </span>
        </div>
      </div>

      <div className="grid gap-5 p-4 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Link
              href={`/repos/${repo.fullName}`}
              className="break-words font-mono text-[14px] font-medium text-foreground decoration-primary decoration-2 underline-offset-4 hover:underline"
            >
              {repo.fullName}
            </Link>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              ★ {formatCount(repo.stars)}
            </span>
          </div>
          {repo.description ? (
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {repo.description}
            </p>
          ) : null}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {repo.language ? <span>{repo.language}</span> : null}
            {repo.license ? <span>{repo.license}</span> : null}
            {repo.category ? <span className="border border-border px-1.5 py-0.5">{repo.category}</span> : null}
            {platform ? <span className="border border-border px-1.5 py-0.5">{platform}</span> : null}
          </div>
        </div>

        <div className="flex items-end justify-between gap-4 md:flex-col md:items-end">
          <div className="text-right">
            <p className="font-display text-4xl font-semibold leading-none tabular-nums text-primary">
              {fitPercent}
            </p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
              Fit / 100
            </p>
          </div>
          <div className="w-full max-w-[240px]">
            <FitMeter breakdown={candidate.breakdown} />
          </div>
        </div>
      </div>

      <div className="grid gap-5 border-t border-border p-4 md:grid-cols-2">
        <div>
          <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Hard conditions / 硬条件核对
          </h3>
          {candidate.conditions.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {candidate.conditions.map((condition, conditionIndex) => {
                const meta = STATUS_META[condition.status];
                const Icon = meta.icon;
                return (
                  <li
                    key={`${condition.key}-${conditionIndex}`}
                    className={cn(
                      'inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-[10px]',
                      meta.className,
                    )}
                  >
                    <Icon className="size-3" aria-hidden />
                    {condition.key}={formatValue(condition.value)} · {meta.label}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-[11px] text-muted-foreground">
              没有设置硬条件，按语义与通用指标排序
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {candidate.reasons.length > 0 ? (
            <div>
              <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Why / 理由
              </h3>
              <ul className="mt-2 flex flex-col gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
                {candidate.reasons.map((reason) => (
                  <li key={reason} className="flex gap-2">
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 bg-primary" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {candidate.risks.length > 0 ? (
            <div>
              <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Risk / 风险
              </h3>
              <ul className="mt-2 flex flex-col gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
                {candidate.risks.map((risk) => (
                  <li key={risk} className="flex gap-2">
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 bg-destructive" />
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {candidate.evidence.length > 0 ? (
        <Collapsible open={evidenceOpen} onOpenChange={setEvidenceOpen}>
          <div className="border-t border-border px-4 py-2">
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-between rounded-none px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
                  Evidence / README 证据（{candidate.evidence.length}）
                </span>
                <ChevronDown
                  className={cn('size-3.5 transition-transform', evidenceOpen && 'rotate-180')}
                  aria-hidden
                />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="flex flex-col gap-3 border-t border-border bg-muted/40 px-4 py-3">
              {candidate.evidence.map((item, evidenceIndex) => (
                <article key={`${item.section}-${evidenceIndex}`}>
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    E{String(evidenceIndex + 1).padStart(2, '0')} · § {item.section}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">
                    {item.snippet}
                  </p>
                  {item.sourceUrl ? (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block font-mono text-[10px] uppercase tracking-[0.1em] text-primary hover:underline"
                    >
                      查看原文 ↗
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-2.5">
        <CompareAddButton fullName={repo.fullName} ideaId={ideaId} />
        <Button asChild variant="outline" size="sm" className="rounded-none">
          <Link href={`/repos/${repo.fullName}`}>查看仓库详情</Link>
        </Button>
      </div>
    </article>
  );
}
