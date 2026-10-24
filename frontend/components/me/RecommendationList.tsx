import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import EmptyState from '@/components/empty-state';
import type { Recommendation } from '@/lib/types';

export default function RecommendationList({ items }: { items: Recommendation[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="暂无可推荐项目"
        description="先在上方填写技能、兴趣与偏好，推荐位会按画像生成。"
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <Link
          key={item.repo.id}
          href={`/repos/${item.repo.fullName}`}
          className="group flex min-w-0 flex-col gap-2 border border-border bg-card p-4 transition-colors hover:border-primary/40"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate font-mono text-[12px] font-medium text-foreground">
              {item.repo.fullName}
            </h3>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
              ★ {item.repo.stars.toLocaleString('en-US')}
            </span>
          </div>
          <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
            {item.repo.description ?? '暂无简介'}
          </p>
          <div className="flex flex-wrap gap-1">
            {item.reasons.map((reason) => (
              <span
                key={reason}
                className="border border-primary/30 bg-primary/5 px-1.5 py-0.5 font-mono text-[9px] text-primary"
              >
                {reason}
              </span>
            ))}
          </div>
          <div className="mt-auto flex items-center justify-between gap-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
              {[item.repo.language, item.repo.category].filter(Boolean).join(' · ') || '未分类'}
            </p>
            <ArrowUpRight
              className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          </div>
        </Link>
      ))}
    </div>
  );
}
