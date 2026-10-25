import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import EmptyState from '@/components/empty-state';
import PageHeader from '@/components/page-header';
import RankRow from '@/components/rank-row';
import TagCloud, { type RankTag } from '@/components/rank/tag-cloud';
import { Button } from '@/components/ui/button';
import { fetchMeta, fetchRank } from '@/lib/api';
import type { FacetItem } from '@/lib/types';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const LIMIT = 30;

const TABS = [
  { key: 'total', label: '总星标榜', hint: '按累计 Star 数排序，观察长期价值项目。' },
  { key: 'weekly', label: '本周活跃榜', hint: '近 7 天仍有代码推送的高 Star 项目。' },
  { key: 'monthly', label: '本月活跃榜', hint: '近 30 天仍在持续迭代的热门项目。' },
  { key: 'new', label: '新晋榜', hint: '按创建时间排序，发现刚出现的项目。' },
] as const;

type RankType = (typeof TABS)[number]['key'];

function tabHref(type: RankType, language?: string, topic?: string): string {
  const qs = new URLSearchParams({ type });
  if (language) {
    qs.set('language', language);
  }
  if (topic) {
    qs.set('topic', topic);
  }
  return `/rank?${qs.toString()}`;
}

/** 合并语言与主题标签；同名时保留语言标签，避免重复。 */
function buildTags(languages: FacetItem[], topics: FacetItem[]): RankTag[] {
  const languageNames = new Set(languages.map((item) => item.name.toLowerCase()));
  return [
    ...languages.map((item) => ({ ...item, kind: 'language' as const })),
    ...topics
      .filter((item) => !languageNames.has(item.name.toLowerCase()))
      .map((item) => ({ ...item, kind: 'topic' as const })),
  ].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export default async function RankPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const rawType = typeof sp.type === 'string' ? sp.type : '';
  const type: RankType = TABS.some((tab) => tab.key === rawType)
    ? (rawType as RankType)
    : 'total';
  const language = typeof sp.language === 'string' && sp.language ? sp.language : undefined;
  const topic = typeof sp.topic === 'string' && sp.topic ? sp.topic : undefined;

  const [items, meta] = await Promise.all([
    fetchRank(type, language, LIMIT, topic),
    fetchMeta(),
  ]);

  const current = TABS.find((tab) => tab.key === type) ?? TABS[0];
  const tags = buildTags(meta.languages, meta.topics);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        index="02.1"
        eyebrow="Leaderboards"
        title="开源项目排行榜"
        description="按 Star、近期活跃度与创建时间整理榜单，并可按语言或主题标签筛选；排名只反映公开仓库的客观指标，是否适合你的场景仍需回到项目档案核对证据。"
        meta={
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {items.length} entries · updated from public GitHub metadata
          </p>
        }
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-lg">
            <Link href="/repos">
              浏览全部档案
              <ArrowUpRight className="size-3.5" data-icon="inline-end" />
            </Link>
          </Button>
        }
      />

      <section className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card p-1.5">
        {TABS.map((tab) => {
          const active = tab.key === type;
          return (
            <Link
              key={tab.key}
              href={tabHref(tab.key, language, topic)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-lg px-3 py-1.5 text-[13px] transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
        <span className="ml-auto hidden pr-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:inline">
          {current.hint}
        </span>
      </section>

      <TagCloud
        tags={tags}
        type={type}
        selectedLanguage={language}
        selectedTopic={topic}
      />

      {items.length === 0 ? (
        <EmptyState
          title="暂无榜单数据"
          description="等待采集任务完成后，这里会出现按指标排序的仓库。"
          action={
            language || topic ? (
              <Button asChild variant="outline" size="sm" className="rounded-lg">
                <Link href={tabHref(type)}>清除筛选</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
            <h2 className="text-section font-semibold text-foreground">{current.label}</h2>
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {language || topic ? (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-primary">
                  {language || topic}
                </span>
              ) : null}
              <span>共 {items.length} 个项目</span>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {items.map((repo, index) => (
              <RankRow key={repo.id} repo={repo} rank={index + 1} />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <p className="max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
          榜单依据公开 GitHub 元数据生成，Star 数会随时间变化；活跃榜仅表示近期有推送，不代表质量评价。
        </p>
        <Link
          href="/match"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/70"
        >
          用需求找仓库
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      </section>
    </div>
  );
}
