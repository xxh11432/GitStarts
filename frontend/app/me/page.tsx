import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';

import AccountDangerZone from '@/components/me/AccountDangerZone';
import ProfileEditor from '@/components/me/ProfileEditor';
import RecommendationList from '@/components/me/RecommendationList';
import QuotaBadge from '@/components/QuotaBadge';
import SectionHeading from '@/components/section-heading';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  fetchMe,
  fetchMyComparisons,
  fetchMyConversations,
  fetchMyFavorites,
  fetchMyIdeas,
  fetchProfile,
  fetchRecommendations,
} from '@/lib/api';
import type { Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

const EMPTY_PROFILE: Profile = { skills: [], interests: [], preferences: [] };

function formatTime(value?: string): string {
  return value ? value.slice(0, 16).replace('T', ' ') : '—';
}

export default async function MePage() {
  const me = await fetchMe();
  if (!me) {
    redirect('/login?next=/me');
  }

  const [profile, recommendations, favorites, ideas, comparisons, conversations] = await Promise.all([
    fetchProfile(),
    fetchRecommendations(6),
    fetchMyFavorites(1, 5),
    fetchMyIdeas(1, 5),
    fetchMyComparisons(1, 5),
    fetchMyConversations(1, 5),
  ]);

  const assets = [
    {
      title: '收藏仓库',
      count: favorites?.total ?? 0,
      href: '/me/favorites',
      description: favorites?.items[0]?.repo.fullName ?? '收藏会在所有设备与会话间同步',
    },
    {
      title: '对比记录',
      count: comparisons?.total ?? 0,
      href: '/me/comparisons',
      description: comparisons?.items[0]?.repoKeys.join(' vs ') ?? '保存每次对比结论并支持只读分享',
    },
    {
      title: '会话历史',
      count: conversations?.total ?? 0,
      href: '/me/conversations',
      description: conversations?.items[0]?.title ?? '回看与 AI 的历史对话',
    },
    {
      title: '我的想法',
      count: ideas?.total ?? 0,
      href: '/me/ideas',
      description: ideas?.items[0]?.title ?? '结构化需求可继续用于匹配与对比',
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <section className="min-w-0 border border-border bg-card">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex items-center gap-4 p-5">
            <Avatar className="size-16 rounded-none">
              {me.avatarUrl ? <AvatarImage src={me.avatarUrl} alt="" /> : null}
              <AvatarFallback className="rounded-none bg-primary font-display text-2xl text-primary-foreground">
                {(me.nickname ?? '我').slice(0, 1)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Account dossier
              </p>
              <h1 className="mt-1 truncate font-display text-title font-semibold text-foreground">
                {me.nickname ?? 'GitHub 用户'}
              </h1>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                ID {me.id} · via GitHub
              </p>
            </div>
          </div>
          <div className="border-t border-border p-4 lg:border-l lg:border-t-0">
            <QuotaBadge initial={me.quota} />
          </div>
        </div>
      </section>

      <ProfileEditor initial={profile ?? EMPTY_PROFILE} />

      <section className="flex flex-col gap-3">
        <SectionHeading index="02" title="为你推荐" count={recommendations?.length ?? 0} />
        <p className="text-[11px] text-muted-foreground">
          按技能、兴趣与偏好匹配，已排除收藏过的仓库。
        </p>
        <RecommendationList items={recommendations ?? []} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading index="03" title="我的资产" />
        <div className="grid gap-px border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          {assets.map((asset) => (
            <Link
              key={asset.title}
              href={asset.href}
              className="group flex flex-col gap-2 bg-card p-4 transition-colors hover:bg-muted"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[13px] font-medium text-foreground">{asset.title}</h3>
                <span className="font-display text-xl font-semibold tabular-nums text-primary">
                  {asset.count}
                </span>
              </div>
              <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                {asset.description}
              </p>
              <ArrowUpRight
                className="mt-auto size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              />
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="min-w-0 border border-border bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground">
              Recent comparisons / 最近对比
            </h2>
            <Link
              href="/me/comparisons"
              className="font-mono text-[10px] uppercase tracking-[0.1em] text-primary hover:underline"
            >
              全部
            </Link>
          </div>
          <div className="p-4">
            {comparisons?.items.length ? (
              <ul className="flex flex-col gap-2">
                {comparisons.items.map((item, index) => (
                  <li key={item.id}>
                    <Link
                      href={`/me/comparisons/${item.id}`}
                      className="group flex min-w-0 items-start gap-3 border border-border bg-background px-3 py-2 transition-colors hover:border-primary/40"
                    >
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[12px] text-foreground">
                          {item.repoKeys.join(' vs ')}
                        </p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                          {formatTime(item.createdAt)} · {item.shared ? 'shared' : 'private'}
                        </p>
                      </div>
                      <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-muted-foreground">还没有对比记录。</p>
            )}
          </div>
        </section>

        <section className="min-w-0 border border-border bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground">
              Recent conversations / 最近会话
            </h2>
            <Link
              href="/me/conversations"
              className="font-mono text-[10px] uppercase tracking-[0.1em] text-primary hover:underline"
            >
              全部
            </Link>
          </div>
          <div className="p-4">
            {conversations?.items.length ? (
              <ul className="flex flex-col gap-2">
                {conversations.items.map((item, index) => (
                  <li key={item.id}>
                    <Link
                      href={`/me/conversations/${item.id}`}
                      className="group flex min-w-0 items-start gap-3 border border-border bg-background px-3 py-2 transition-colors hover:border-primary/40"
                    >
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] text-foreground">
                          {item.title || `会话 #${item.id}`}
                        </p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                          {item.messageCount} messages · {formatTime(item.updatedAt)}
                        </p>
                      </div>
                      <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-muted-foreground">还没有会话记录。</p>
            )}
          </div>
        </section>
      </div>

      <AccountDangerZone />
    </div>
  );
}
