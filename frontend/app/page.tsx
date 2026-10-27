import Link from 'next/link';
import {
  ArrowUpRight,
  Boxes,
  Brain,
  ChartColumn,
  Database,
  Gamepad2,
  LayoutTemplate,
  Server,
  ShieldCheck,
  Smartphone,
  Terminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import ChatLauncher from '@/components/ChatLauncher';
import ExamplePrompts, { type ExamplePrompt } from '@/components/ExamplePrompts';
import RepoCard from '@/components/repo-card';
import SampleDossier from '@/components/sample-dossier';
import SectionHeading from '@/components/section-heading';
import { fetchMeta, fetchRank } from '@/lib/api';

export const dynamic = 'force-dynamic';

const examples: ExamplePrompt[] = [
  { label: '自托管团队知识库', query: '帮我找一个可 Docker 自托管的中文知识库' },
  { label: '本地 AI 笔记工具', query: '有没有本地优先、支持 AI 摘要的笔记工具？' },
  { label: 'Docker 监控面板', query: '推荐一个可 Docker 部署的监控面板' },
  { label: '中文全文检索', query: '哪些开源项目支持中文全文检索并且许可宽松？' },
];

const FLOW = [
  { index: '01', label: 'AI 对话', desc: '把模糊想法说清楚' },
  { index: '02', label: '仓库档案', desc: '核对许可与维护状态' },
  { index: '04', label: '语义匹配', desc: '把条件变成候选清单' },
  { index: '05', label: '深度对比', desc: '2–4 个候选逐项对照' },
];

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  人工智能: Brain,
  前端: LayoutTemplate,
  后端: Server,
  数据科学: ChartColumn,
  数据库: Database,
  devops: Terminal,
  安全: ShieldCheck,
  移动开发: Smartphone,
  游戏: Gamepad2,
  开发工具: Wrench,
  其他: Boxes,
};

export default async function HomePage() {
  const [hotRepos, meta] = await Promise.all([
    fetchRank('total', undefined, 9),
    fetchMeta(),
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
                00 / Overview
              </span>
              <span aria-hidden className="h-px flex-1 bg-border" />
              <span className="hidden sm:inline">Open-source decision ledger</span>
            </div>

            <h1 className="max-w-2xl font-display text-display font-semibold text-foreground">
              有个想法，先问一句。
            </h1>
            <p className="max-w-xl text-body text-muted-foreground">
              首页只负责入口：写下一句话需求，进入 01 AI 对话，由 AI 检索仓库档案并给出带证据的回答；
              需要可核对的候选清单时，再走 04 语义匹配。
            </p>

            <ChatLauncher />
            <ExamplePrompts items={examples} />
          </div>

          <SampleDossier />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading index="01" title="浏览分类" href="/repos" actionLabel="全部分类" />
        <div className="flex flex-wrap gap-2">
          {meta.categories.map((category) => {
            const Icon = CATEGORY_ICONS[category.slug] ?? Boxes;
            return (
              <Link
                key={category.slug}
                href={`/repos?category=${encodeURIComponent(category.slug)}`}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <Icon className="size-4 text-primary" aria-hidden />
                {category.name}
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {category.count}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <SectionHeading
          index="02"
          title="热门开源项目推荐"
          count={hotRepos.length}
          href="/rank"
          actionLabel="查看排行榜"
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {hotRepos.map((repo) => (
            <RepoCard key={repo.id} repo={repo} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <SectionHeading
          index="Flow"
          title="从一句话到可核对的候选"
          href="/chat"
          actionLabel="从第一步开始"
        />
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW.map((step) => (
            <li key={step.index} className="rounded-xl border border-border bg-card p-4">
              <span className="font-mono text-[10px] text-muted-foreground">{step.index}</span>
              <p className="mt-2 text-sm font-medium text-foreground">{step.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          下一步 · 把你的问题带进 01 AI 对话
        </p>
        <div className="flex items-center gap-4">
          <Link
            href="/repos"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            先逛仓库档案
            <ArrowUpRight className="size-4" aria-hidden />
          </Link>
          <Link
            href="/chat"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/70"
          >
            打开 AI 对话
            <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
