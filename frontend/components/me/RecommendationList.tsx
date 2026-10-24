import Link from 'next/link';
import type { Recommendation } from '@/lib/types';

export default function RecommendationList({ items }: { items: Recommendation[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-line bg-surface p-4 text-sm text-ink-muted">
        暂无可推荐项目，先在上方填写技能与兴趣。
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <Link
          key={item.repo.id}
          href={`/repos/${item.repo.fullName}`}
          className="rounded-card border border-line bg-background p-4 shadow-card transition-colors hover:border-accent"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate text-sm font-medium text-ink">{item.repo.fullName}</h3>
            <span className="shrink-0 text-xs text-ink-muted">★ {item.repo.stars.toLocaleString('en-US')}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">
            {item.repo.description ?? '暂无简介'}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {item.reasons.map((reason) => (
              <span key={reason} className="rounded bg-accent/10 px-1.5 py-0.5 text-[11px] text-accent">
                {reason}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-muted">
            {[item.repo.language, item.repo.category].filter(Boolean).join(' · ') || '未分类'}
          </p>
        </Link>
      ))}
    </div>
  );
}
