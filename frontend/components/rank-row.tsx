import Link from 'next/link';
import { Clock, GitFork, Star } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { languageColor } from '@/lib/labels';
import type { Repo } from '@/lib/types';
import { cn, formatRelativeTime } from '@/lib/utils';

function formatCount(value?: number): string {
  if (!value) {
    return '0';
  }
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

function formatDate(value?: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('.');
}

/**
 * 排行榜条目：头像 + owner/name + 描述 + 语言/Star/Fork/更新时间，
 * compact 用于首页榜单速览，full 用于排行榜整页。
 */
export default function RankRow({
  repo,
  rank,
  compact = false,
}: {
  repo: Repo;
  rank: number;
  compact?: boolean;
}) {
  const updated = formatDate(repo.pushedAt) ?? formatRelativeTime(repo.pushedAt);

  return (
    <Link
      href={`/repos/${repo.fullName}`}
      className={cn(
        'group flex items-start gap-3 border-b border-border transition-colors last:border-b-0 hover:bg-muted/60',
        compact ? 'px-3 py-2.5' : 'px-4 py-3.5',
      )}
    >
      <span
        className={cn(
          'shrink-0 text-center font-mono tabular-nums',
          compact ? 'w-4 pt-1.5 text-[11px]' : 'w-8 pt-3 text-[13px]',
          rank <= 3 ? 'font-semibold text-primary' : 'text-muted-foreground',
        )}
      >
        {rank}
      </span>

      <Avatar
        className={cn(
          'shrink-0 rounded-lg border border-border',
          compact ? 'size-7' : 'size-11',
          rank <= 3 && 'ring-1 ring-primary/30',
        )}
      >
        <AvatarImage
          src={`https://github.com/${repo.owner}.png?size=96`}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <AvatarFallback className="rounded-lg bg-muted font-mono text-[11px] text-muted-foreground">
          {(repo.owner || repo.fullName).slice(0, 1).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5',
            compact ? 'text-[12px]' : 'text-[15px]',
          )}
        >
          <span className="min-w-0 break-all font-semibold text-primary group-hover:underline">
            {repo.owner}
          </span>
          <span className="text-muted-foreground">/</span>
          <span className="min-w-0 break-all font-medium text-foreground group-hover:text-primary">
            {repo.name}
          </span>
        </div>

        <p
          className={cn(
            'text-muted-foreground',
            compact
              ? 'mt-0.5 line-clamp-1 text-[10.5px] leading-relaxed'
              : 'mt-1 line-clamp-2 text-[12.5px] leading-relaxed',
          )}
        >
          {repo.description || '暂无描述'}
        </p>

        <div
          className={cn(
            'flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground',
            compact ? 'mt-1 text-[10px]' : 'mt-2 text-[11px]',
          )}
        >
          {repo.language ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: languageColor(repo.language) }}
              />
              {repo.language}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Star className="size-3" aria-hidden />
            {formatCount(repo.stars)}
          </span>
          {!compact ? (
            <span className="inline-flex items-center gap-1">
              <GitFork className="size-3" aria-hidden />
              {formatCount(repo.forks)}
            </span>
          ) : null}
          {updated ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" aria-hidden />
              {updated}
            </span>
          ) : null}
          {!compact && repo.license ? (
            <span className="font-mono text-[10px] uppercase tracking-wide">{repo.license}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
