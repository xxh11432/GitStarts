import Link from 'next/link';
import ExamplePrompts, { type ExamplePrompt } from '@/components/ExamplePrompts';
import HeroComposer from '@/components/HeroComposer';
import RepoCard from '@/components/RepoCard';
import { fetchMeta, fetchRank, fetchRepos } from '@/lib/api';

export const dynamic = 'force-dynamic';

const examples: ExamplePrompt[] = [
  { label: '自托管团队知识库', query: '知识库' },
  { label: '本地 AI 笔记工具', query: '笔记' },
  { label: 'Docker 部署的监控面板', query: '监控' },
  { label: '中文全文检索', query: '检索' },
];

export default async function HomePage() {
  const [hotRepos, recentResult, meta, counter] = await Promise.all([
    fetchRank('total', undefined, 8),
    fetchRepos({ sort: 'pushed', order: 'desc', page: 1, size: 6 }),
    fetchMeta(),
    fetchRepos({ page: 1, size: 1 }),
  ]);

  return (
    <div className="space-y-12 sm:space-y-16">
      <section className="pt-6 text-center sm:pt-12">
        <p className="text-xs font-medium uppercase tracking-widest text-accent">
          开源方案决策平台
        </p>
        <h1 className="mx-auto mt-3 max-w-3xl text-2xl font-semibold leading-tight text-ink sm:text-display">
          有个想法，先看看有没有能直接用的开源项目
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-body text-ink-secondary">
          描述你的场景与硬条件，匹配候选项目，再让 AI 读 README 做横向对比，每个结论都附证据。
        </p>

        <HeroComposer />
        <ExamplePrompts items={examples} />

        <dl className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
          <Stat label="已收录仓库" value={counter.total} />
          <Stat label="覆盖语言" value={meta.languages.length} />
          <Stat label="覆盖平台" value={meta.platforms.length} />
          <Stat label="覆盖分类" value={meta.categories.length} />
        </dl>
      </section>

      {meta.platforms.length > 0 && (
        <section>
          <SectionHeader title="按平台浏览" href="/repos" />
          <div className="flex flex-wrap gap-2">
            {meta.platforms
              .filter((platform) => platform.slug !== 'other')
              .slice(0, 8)
              .map((platform) => (
                <Link
                  key={platform.slug}
                  href={`/repos?platform=${encodeURIComponent(platform.slug)}`}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-secondary transition-colors duration-150 hover:border-accent hover:text-accent"
                >
                  {platform.name}
                  <span className="ml-1.5 text-xs tabular-nums text-ink-muted">{platform.count}</span>
                </Link>
              ))}
          </div>
        </section>
      )}

      {meta.categories.length > 0 && (
        <section>
          <SectionHeader title="按分类浏览" href="/repos" />
          <div className="flex flex-wrap gap-2">
            {meta.categories.slice(0, 12).map((category) => (
              <Link
                key={category.slug}
                href={`/repos?category=${encodeURIComponent(category.slug)}`}
                className="rounded-full border border-line bg-background px-3 py-1.5 text-sm text-ink-secondary transition-colors duration-150 hover:border-accent hover:text-accent"
              >
                {category.name}
                <span className="ml-1.5 text-xs tabular-nums text-ink-muted">{category.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeader title="热门开源项目" href="/repos" />
        {hotRepos.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {hotRepos.map((repo) => (
              <RepoCard key={repo.id} repo={repo} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="最近更新" href="/repos?sort=pushedAt&order=desc" />
        {recentResult.items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {recentResult.items.map((repo) => (
              <RepoCard key={repo.id} repo={repo} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <Link href={href} className="text-sm text-ink-secondary transition-colors hover:text-accent">
        查看全部
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface px-3 py-4 text-center sm:py-5">
      <dd className="text-2xl font-semibold tabular-nums text-ink">
        {value.toLocaleString('zh-CN')}
      </dd>
      <dt className="mt-1 text-xs text-ink-muted">{label}</dt>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-card border border-dashed border-line bg-surface px-4 py-10 text-center text-sm text-ink-muted">
      暂无数据，等待采集完成
    </div>
  );
}
