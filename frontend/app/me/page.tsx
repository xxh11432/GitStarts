import Link from 'next/link';
import { redirect } from 'next/navigation';
import AccountDangerZone from '@/components/me/AccountDangerZone';
import ProfileEditor from '@/components/me/ProfileEditor';
import RecommendationList from '@/components/me/RecommendationList';
import QuotaBadge from '@/components/QuotaBadge';
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

  const favoriteCount = favorites?.total ?? 0;
  const ideaCount = ideas?.total ?? 0;
  const comparisonCount = comparisons?.total ?? 0;
  const conversationCount = conversations?.total ?? 0;

  const assets = [
    {
      title: '收藏仓库',
      count: favoriteCount,
      href: '/me/favorites',
      description: favorites?.items[0]?.repo.fullName ?? '收藏会在所有设备与会话间同步',
    },
    {
      title: '对比记录',
      count: comparisonCount,
      href: '/me/comparisons',
      description: comparisons?.items[0]?.repoKeys.join(' vs ') ?? '保存每次对比结论并支持只读分享',
    },
    {
      title: '会话历史',
      count: conversationCount,
      href: '/me/conversations',
      description: conversations?.items[0]?.title ?? '回看与 AI 的历史对话',
    },
    {
      title: '我的想法',
      count: ideaCount,
      href: '/me/ideas',
      description: ideas?.items[0]?.title ?? '结构化需求可继续用于匹配与对比',
    },
  ];

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-background p-5 shadow-card">
        {me.avatarUrl ? (
          <img src={me.avatarUrl} alt="" className="h-14 w-14 rounded-full border border-line" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-xl text-ink-secondary">
            {(me.nickname ?? '我').slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-ink">{me.nickname ?? 'GitHub 用户'}</h1>
          <p className="mt-1 text-sm text-ink-muted">账号 ID：{me.id} · 通过 GitHub 登录</p>
        </div>
        <div className="w-full shrink-0 sm:w-72">
          <QuotaBadge initial={me.quota} />
        </div>
      </section>

      <ProfileEditor initial={profile ?? EMPTY_PROFILE} />

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-ink">为你推荐</h2>
            <p className="mt-1 text-xs text-ink-muted">按技能、兴趣与偏好匹配，已排除收藏过的仓库。</p>
          </div>
        </div>
        <RecommendationList items={recommendations ?? []} />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-ink">我的资产</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {assets.map((asset) => (
            <Link
              key={asset.title}
              href={asset.href}
              className="rounded-card border border-line bg-background p-4 shadow-card transition-colors hover:border-accent"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium text-ink">{asset.title}</h3>
                <span className="text-lg font-semibold text-accent">{asset.count}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">{asset.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-background p-5 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">最近对比</h2>
            <Link href="/me/comparisons" className="text-xs text-accent hover:underline">
              查看全部
            </Link>
          </div>
          {comparisons?.items.length ? (
            <ul className="mt-3 space-y-2">
              {comparisons.items.map((item) => (
                <li key={item.id}>
                  <Link href={`/me/comparisons/${item.id}`} className="block rounded-md border border-line px-3 py-2 hover:border-accent">
                    <p className="truncate text-xs font-medium text-ink">{item.repoKeys.join(' vs ')}</p>
                    <p className="mt-1 text-[11px] text-ink-muted">
                      {formatTime(item.createdAt)} · {item.shared ? '已分享' : '未分享'}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-ink-muted">还没有对比记录。</p>
          )}
        </section>

        <section className="rounded-card border border-line bg-background p-5 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">最近会话</h2>
            <Link href="/me/conversations" className="text-xs text-accent hover:underline">
              查看全部
            </Link>
          </div>
          {conversations?.items.length ? (
            <ul className="mt-3 space-y-2">
              {conversations.items.map((item) => (
                <li key={item.id}>
                  <Link href={`/me/conversations/${item.id}`} className="block rounded-md border border-line px-3 py-2 hover:border-accent">
                    <p className="truncate text-xs font-medium text-ink">{item.title || `会话 #${item.id}`}</p>
                    <p className="mt-1 text-[11px] text-ink-muted">
                      {item.messageCount} 条消息 · {formatTime(item.updatedAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-ink-muted">还没有会话记录。</p>
          )}
        </section>
      </div>

      <AccountDangerZone />
    </div>
  );
}
