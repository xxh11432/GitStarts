import Link from 'next/link';
import CompareAddButton from '@/components/compare/CompareAddButton';
import FitBreakdown from './FitBreakdown';
import type { ConditionStatus, MatchCandidate } from '@/lib/match';
import { platformLabel } from '@/lib/labels';

const STATUS_LABEL: Record<ConditionStatus, string> = {
  hit: '满足',
  miss: '未满足',
  unknown: '无法确认',
};

const STATUS_CLASS: Record<ConditionStatus, string> = {
  hit: 'border-accent/30 bg-accent/5 text-accent',
  miss: 'border-danger/30 bg-danger/5 text-danger',
  unknown: 'border-line bg-surface text-ink-muted',
};

function formatCount(value?: number): string {
  if (value === undefined) {
    return '';
  }
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

function formatValue(value: string | number | boolean | string[]): string {
  if (Array.isArray(value)) {
    return value.join(' / ');
  }
  return String(value);
}

export default function CandidateCard({
  candidate,
  ideaId,
}: {
  candidate: MatchCandidate;
  ideaId?: number | null;
}) {
  const { repo } = candidate;
  const platform = platformLabel(repo.platform);
  const fitPercent = Math.round(candidate.fit * 100);

  return (
    <article className="rounded-card border border-line bg-background p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={`/repos/${repo.fullName}`}
            className="break-words text-base font-semibold text-ink hover:text-accent"
          >
            {repo.fullName}
          </Link>
          {repo.description && (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-secondary">
              {repo.description}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-muted">
            <span>{formatCount(repo.stars)} stars</span>
            {repo.language && <span>{repo.language}</span>}
            {repo.license && <span>{repo.license}</span>}
            {repo.category && (
              <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-ink-secondary">
                {repo.category}
              </span>
            )}
            {platform && (
              <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-ink-secondary">
                {platform}
              </span>
            )}
            {candidate.fitted && <span>已重排</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-3xl font-semibold tabular-nums text-accent">{fitPercent}</p>
          <p className="text-xs text-ink-muted">契合度 / 100</p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            契合度分解
          </h3>
          <FitBreakdown breakdown={candidate.breakdown} />
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            硬条件核对
          </h3>
          {candidate.conditions.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {candidate.conditions.map((condition, index) => (
                <li
                  key={`${condition.key}-${index}`}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_CLASS[condition.status]}`}
                >
                  {condition.key}={formatValue(condition.value)} · {STATUS_LABEL[condition.status]}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-muted">没有设置硬条件，按语义与通用指标排序</p>
          )}
        </div>
      </div>

      {(candidate.reasons.length > 0 || candidate.risks.length > 0) && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {candidate.reasons.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                匹配理由
              </h3>
              <ul className="space-y-1.5 text-sm leading-relaxed text-ink-secondary">
                {candidate.reasons.map((reason) => (
                  <li key={reason} className="flex gap-2">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {candidate.risks.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                风险与待确认
              </h3>
              <ul className="space-y-1.5 text-sm leading-relaxed text-ink-secondary">
                {candidate.risks.map((risk) => (
                  <li key={risk} className="flex gap-2">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {candidate.evidence.length > 0 && (
        <details className="mt-4 rounded-card border border-line bg-surface px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-ink-secondary">
            README 证据（{candidate.evidence.length}）
          </summary>
          <div className="mt-2 space-y-3">
            {candidate.evidence.map((item, index) => (
              <div key={`${item.section}-${index}`}>
                <p className="text-[11px] font-medium text-ink-muted">§ {item.section}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-secondary">
                  {item.snippet}
                </p>
                {item.sourceUrl && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-[11px] text-accent hover:underline"
                  >
                    查看原文
                  </a>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <CompareAddButton fullName={repo.fullName} ideaId={ideaId} />
        <Link
          href={`/repos/${repo.fullName}`}
          className="rounded-md border border-line bg-background px-3 py-1.5 text-sm text-ink-secondary transition-colors hover:border-accent hover:text-accent"
        >
          查看仓库详情
        </Link>
      </div>
    </article>
  );
}
