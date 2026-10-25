import Link from 'next/link';
import {
  ArrowUpRight,
  History,
  MessageSquare,
  Scale,
  Search,
  Sparkles,
  Trophy,
} from 'lucide-react';

import ChatLauncher from '@/components/ChatLauncher';
import ExamplePrompts, { type ExamplePrompt } from '@/components/ExamplePrompts';
import SectionHeading from '@/components/section-heading';

const examples: ExamplePrompt[] = [
  { label: '自托管团队知识库', query: '帮我找一个可 Docker 自托管的中文知识库' },
  { label: '本地 AI 笔记工具', query: '有没有本地优先、支持 AI 摘要的笔记工具？' },
  { label: 'Docker 监控面板', query: '推荐一个可 Docker 部署的监控面板' },
  { label: '中文全文检索', query: '哪些开源项目支持中文全文检索并且许可宽松？' },
];

const MODULES = [
  {
    index: '01',
    href: '/chat',
    title: 'AI 对话',
    desc: '描述场景与硬条件，AI 检索仓库档案、给出带证据的候选，并支持多轮追问。',
    cta: '开始对话',
    icon: MessageSquare,
  },
  {
    index: '02',
    href: '/repos',
    title: '仓库档案库',
    desc: '按平台、分类、语言与许可证组合筛选，每条记录都能回到仓库原文核对。',
    cta: '浏览档案',
    icon: Search,
  },
  {
    index: '03',
    href: '/rank',
    title: '排行榜',
    desc: '总星标、本周活跃、新晋等多个榜单，用公开指标观察项目的长期与近期状态。',
    cta: '查看榜单',
    icon: Trophy,
  },
  {
    index: '04',
    href: '/match',
    title: '语义匹配',
    desc: '把需求抽成结构化条件，向量召回后重排，并按四项权重给出可核对的契合度。',
    cta: '进入匹配',
    icon: Sparkles,
  },
  {
    index: '05',
    href: '/compare',
    title: '深度对比',
    desc: '2–4 个候选按 8 个维度横向展开，每个单元格附 README 或 manifest 证据。',
    cta: '打开对比',
    icon: Scale,
  },
  {
    index: '06',
    href: '/me/conversations',
    title: '会话与资产',
    desc: '对话、想法、对比与收藏按账号保存，重新登录后仍可回看与继续。',
    cta: '查看我的',
    icon: History,
  },
];

const FLOW = [
  { index: '01', label: 'AI 对话', desc: '把模糊想法说清楚' },
  { index: '02', label: '仓库档案', desc: '核对许可与维护状态' },
  { index: '04', label: '语义匹配', desc: '把条件变成候选清单' },
  { index: '05', label: '深度对比', desc: '2–4 个候选逐项对照' },
];

const BOUNDARIES = [
  '只引用站内索引与 README / manifest 证据',
  '没有依据时明确写「信息不足」，不猜许可与功能',
  '契合度只用于排序，不是质量结论',
  '许可证与部署方式以仓库原文为准',
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-14 sm:gap-16">
      <section className="relative overflow-hidden rounded-xl border border-border bg-card">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-dots-soft opacity-70" />
        <div className="relative grid gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:px-10 lg:py-14">
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

          <div className="stagger rounded-xl border border-border bg-background/70 p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Scope / 能力边界
            </p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {BOUNDARIES.map((item) => (
                <li key={item} className="flex gap-2 text-[12px] leading-relaxed text-muted-foreground">
                  <span aria-hidden className="mt-1.5 size-1 shrink-0 bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
              对话入口在 01，候选清单在 04，横向对照在 05。每个结论都要求能回到证据。
            </p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <SectionHeading index="01–06" title="功能入口" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((module) => {
            const Icon = module.icon;
            return (
              <Link
                key={module.href}
                href={module.href}
                className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-muted text-primary">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">{module.index}</span>
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-foreground">{module.title}</h2>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    {module.desc}
                  </p>
                </div>
                <span className="mt-auto inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors group-hover:text-primary">
                  {module.cta}
                  <ArrowUpRight className="size-3" aria-hidden />
                </span>
              </Link>
            );
          })}
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
