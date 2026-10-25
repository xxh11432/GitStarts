import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import EmptyState from '@/components/empty-state';
import ExamplePrompts, { type ExamplePrompt } from '@/components/ExamplePrompts';
import HeroComposer from '@/components/HeroComposer';
import Metric from '@/components/metric';
import RankRow from '@/components/rank-row';
import RepoCard from '@/components/repo-card';
import SampleDossier from '@/components/sample-dossier';
import SectionHeading from '@/components/section-heading';
import { fetchMeta, fetchRank, fetchRepos } from '@/lib/api';
import type { Repo } from '@/lib/types';

export const dynamic = 'force-dynamic';

const examples: ExamplePrompt[] = [
  { label: '自托管团队知识库', query: '知识库' },
  { label: '本地 AI 笔记工具', query: '笔记' },
  { label: 'Docker 部署的监控面板', query: '监控' },
  { label: '中文全文检索', query: '检索' },
];

/** 首页榜单速览：从排行榜中挑出总榜、本周活跃与新晋榜的头部条目。 */
function MiniRank({
  index,
  title,
  href,
  items,
}: {
  index: string;
  title: string;
  href: string;
  items: Repo[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">{index}</span>
          <h3 className="text-[13px] font-medium text-foreground">{title}</h3>
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-primary"
        >
          查看榜单
          <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">暂无榜单数据</p>
      ) : (
        <ol>
          {items.map((repo, i) => (
            <li key={repo.id}>
              <RankRow repo={repo} rank={i + 1} compact />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default async function HomePage() {
  const [hotRepos, weeklyRepos, newRepos, recentResult, meta, counter] = await Promise.all([
    fetchRank('total', undefined, 8),
    fetchRank('weekly', undefined, 5),
    fetchRank('new', undefined, 5),
    fetchRepos({ sort: 'pushed', order: 'desc', page: 1, size: 6 }),
    fetchMeta(),
    fetchRepos({ page: 1, size: 1 }),
  ]);

  return (
    <div className="flex flex-col gap-14 sm:gap-16">
      <section className="relative overflow-hidden rounded-xl border border-border bg-card">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-dots-soft opacity-70" />
        <div className="relative grid gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:px-10 lg:py-14">
          <div className="stagger flex flex-col gap-6">
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span className="inline-flex items-center gap-2 text-primary">
                <span aria-hidden className="size-1.5 bg-primary" />
                01 / Intake
              </span>
              <span aria-hidden className="h-px flex-1 bg-border" />
              <span className="hidden sm:inline">Open-source decision ledger</span>
            </div>

            <h1 className="max-w-2xl font-display text-display font-semibold text-foreground">
              有个想法，先查开源档案。
            </h1>
            <p className="max-w-xl text-body text-muted-foreground">
              描述场景与硬条件，AI 会检索仓库并给出可核对的候选；许可证与部署方式以项目仓库为准。
              每个结论都附证据，缺证据就写「信息不足」。
            </p>

            <HeroComposer />
            <ExamplePrompts items={examples} />
          </div>

          <div className="hidden lg:block">
            <SampleDossier />
          </div>
        </div>
      </section>

      <section aria-label="站点统计">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
          <div className="bg-card">
            <Metric label="已收录仓库" value={counter.total} />
          </div>
          <div className="bg-card">
            <Metric label="覆盖语言" value={meta.languages.length} />
          </div>
          <div className="bg-card">
            <Metric label="覆盖平台" value={meta.platforms.length} />
          </div>
          <div className="bg-card">
            <Metric label="覆盖分类" value={meta.categories.length} />
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading index="02" title="排行榜速览" href="/rank" actionLabel="进入排行榜" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <MiniRank index="A" title="总星标榜" href="/rank?type=total" items={hotRepos.slice(0, 5)} />
          <MiniRank
            index="B"
            title="本周活跃榜"
            href="/rank?type=weekly"
            items={weeklyRepos}
          />
          <MiniRank index="C" title="新晋榜" href="/rank?type=new" items={newRepos} />
        </div>
      </section>

      {meta.platforms.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHeading index="03" title="按平台浏览" href="/repos" actionLabel="全部平台" />
          <div className="flex flex-wrap gap-2">
            {meta.platforms
              .filter((platform) => platform.slug !== 'other')
              .slice(0, 8)
              .map((platform) => (
                <Link
                  key={platform.slug}
                  href={`/repos?platform=${encodeURIComponent(platform.slug)}`}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {platform.name}
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {platform.count}
                  </span>
                </Link>
              ))}
          </div>
        </section>
      ) : null}

      {meta.categories.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHeading index="04" title="按分类浏览" href="/repos" actionLabel="全部分类" />
          <div className="flex flex-wrap gap-2">
            {meta.categories.slice(0, 12).map((category) => (
              <Link
                key={category.slug}
                href={`/repos?category=${encodeURIComponent(category.slug)}`}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {category.name}
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {category.count}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <SectionHeading
          index="05"
          title="热门开源项目"
          count={hotRepos.length}
          href="/repos"
          actionLabel="全部档案"
        />
        {hotRepos.length === 0 ? (
          <EmptyState title="暂无榜单数据" description="等待采集任务完成后，这里会出现按 star 排序的档案。" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hotRepos.map((repo) => (
              <RepoCard key={repo.id} repo={repo} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading
          index="06"
          title="最近更新"
          count={recentResult.items.length}
          href="/repos?sort=pushedAt&order=desc"
          actionLabel="全部更新"
        />
        {recentResult.items.length === 0 ? (
          <EmptyState title="暂无更新记录" description="等待采集任务完成后再查看最近推送的仓库。" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentResult.items.map((repo) => (
              <RepoCard key={repo.id} repo={repo} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          下一步 · 把候选带进对比工作台
        </p>
        <Link
          href="/compare"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/70"
        >
          打开深度对比
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      </section>
    </div>
  );
}
