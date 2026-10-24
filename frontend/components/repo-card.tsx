import Link from 'next/link';
import {
  Apple,
  Globe,
  Monitor,
  Puzzle,
  Smartphone,
  Star,
  Terminal,
} from 'lucide-react';

import RepoBookmarkButton from '@/components/repo-bookmark';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { languageColor, platformLabel } from '@/lib/labels';
import type { Repo } from '@/lib/types';
import { cn, formatRelativeTime } from '@/lib/utils';

function formatCount(value?: number): string {
  if (!value) {
    return '0';
  }
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

const PLATFORM_ICONS: Record<string, typeof Globe> = {
  windows: Monitor,
  mac: Apple,
  linux: Terminal,
  android: Smartphone,
  ios: Smartphone,
  harmony: Globe,
  extension: Puzzle,
  other: Globe,
};

function RepoPlatforms({ repo }: { repo: Repo }) {
  const platforms = (repo.platforms?.length ? repo.platforms : [repo.platform])
    .filter((value): value is string => Boolean(value))
    .slice(0, 4);
  if (platforms.length === 0) {
    return null;
  }
  return (
    <div className="flex items-center gap-1.5">
      {platforms.map((platform) => {
        const Icon = PLATFORM_ICONS[platform] ?? Globe;
        return (
          <span
            key={platform}
            title={platformLabel(platform)}
            aria-label={platformLabel(platform)}
            className="inline-flex items-center text-muted-foreground"
          >
            <Icon className="size-3.5" aria-hidden />
          </span>
        );
      })}
    </div>
  );
}

export default function RepoCard({
  repo,
  authenticated = false,
  favorite,
}: {
  repo: Repo;
  authenticated?: boolean;
  favorite?: { favorited: boolean; id?: number };
}) {
  const updated = formatRelativeTime(repo.pushedAt);
  const topics = repo.topics?.slice(0, 2) ?? [];

  return (
    <article className="group flex h-full flex-col border border-border bg-card p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start gap-3">
        <Avatar className="size-9 shrink-0 rounded-none border border-border">
          <AvatarImage
            src={`https://github.com/${repo.owner}.png?size=96`}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <AvatarFallback className="rounded-none bg-muted font-mono text-[12px] text-muted-foreground">
            {(repo.owner || repo.fullName).slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <Link
              href={`/repos/${repo.fullName}`}
              className="min-w-0 truncate font-mono text-[13px] font-medium text-foreground decoration-primary decoration-2 underline-offset-4 hover:underline"
            >
              {repo.fullName}
            </Link>
            <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums text-muted-foreground">
              <Star className="size-3" aria-hidden />
              {formatCount(repo.stars)}
            </span>
          </div>
          <p className="mt-1.5 line-clamp-2 min-h-[2.4em] text-[12px] leading-relaxed text-muted-foreground">
            {repo.description || '暂无描述'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {repo.latestReleaseTag ? (
          <span
            title={repo.latestReleaseAt ? `发布于 ${repo.latestReleaseAt.slice(0, 10)}` : undefined}
            className="border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-tight text-foreground"
          >
            {repo.latestReleaseTag}
          </span>
        ) : null}
        {repo.language ? (
          <span className="inline-flex items-center gap-1 border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ backgroundColor: languageColor(repo.language) }}
            />
            {repo.language}
          </span>
        ) : null}
        {topics.map((topic) => (
          <span
            key={topic}
            className="border border-border px-1.5 py-0.5 font-mono text-[10px] lowercase tracking-tight text-muted-foreground"
          >
            {topic}
          </span>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-muted-foreground">
          <RepoPlatforms repo={repo} />
          {updated ? <span>更新于 {updated}</span> : null}
          {repo.license ? <span className="font-mono uppercase tracking-wide">{repo.license}</span> : null}
        </div>
        <div className={cn('flex shrink-0 items-center gap-1', !favorite && 'opacity-0 group-hover:opacity-100')}>
          {favorite ? (
            <RepoBookmarkButton
              fullName={repo.fullName}
              authenticated={authenticated}
              initialFavorited={favorite.favorited}
              initialId={favorite.id}
            />
          ) : (
            <Link
              href={`/repos/${repo.fullName}`}
              aria-label={`查看 ${repo.fullName} 详情`}
              className="inline-flex size-7 items-center justify-center text-muted-foreground transition-colors hover:text-primary"
            >
              <Star className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
