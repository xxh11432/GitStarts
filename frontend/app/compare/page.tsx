import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';

import PageHeader from '@/components/page-header';
import QuotaBadge from '@/components/QuotaBadge';
import CompareWorkbench from '@/components/compare/CompareWorkbench';
import { Button } from '@/components/ui/button';
import {
  fetchComparison,
  fetchIdea,
  fetchMe,
  fetchMyComparisons,
} from '@/lib/api';
import type { ComparisonDetail } from '@/lib/compare';

export const dynamic = 'force-dynamic';

export default async function ComparePage({
  searchParams,
}: {
  searchParams: { repos?: string; ideaId?: string };
}) {
  const me = await fetchMe();
  if (!me) {
    redirect('/login?next=/compare');
  }

  const urlRepos = (searchParams.repos ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => /^[\w.-]+\/[\w.-]+$/.test(item))
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 4);
  const parsedIdeaId = Number.parseInt(searchParams.ideaId ?? '', 10);
  const initialIdeaId = Number.isFinite(parsedIdeaId) && parsedIdeaId > 0 ? parsedIdeaId : null;

  // 「继续对比」入口：带入想法原文；没有带仓库时再读取该想法最近一次对比结果。
  const idea = initialIdeaId ? await fetchIdea(initialIdeaId) : null;
  let previousComparison: ComparisonDetail | null = null;
  if (initialIdeaId && urlRepos.length === 0) {
    const comparisons = await fetchMyComparisons(1, 1, initialIdeaId);
    const latest = comparisons?.items?.[0];
    if (latest) {
      previousComparison = await fetchComparison(latest.id);
    }
  }
  const initialRepos = urlRepos.length > 0 ? urlRepos : (previousComparison?.repoKeys ?? []);
  const initialRawText = idea?.rawText ?? '';

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        index="04"
        eyebrow="Deep compare"
        title="把 2–4 个候选放在一起看"
        description="按定位、技术栈、部署、能力覆盖、许可、活跃度、扩展性与风险 8 个维度展开，每个单元格都附带 README / manifest 证据或显式标注「信息不足」。"
        meta={
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            8 dimensions · 2–4 repos · evidence per cell
          </p>
        }
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-none">
            <Link href="/match">
              先去匹配候选
              <ArrowUpRight className="size-3.5" data-icon="inline-end" />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="order-2 flex flex-col gap-4 md:order-1">
          <QuotaBadge initial={me.quota} />
          <section className="border border-border bg-card p-4">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground">
              How to use / 怎么用
            </h2>
            <div className="mt-3 flex flex-col gap-2.5 text-xs leading-relaxed text-muted-foreground">
              <p>先在「语义匹配」里挑候选，点「加入对比」把仓库带到这里；也可以直接输入 owner/name。</p>
              <p>每格证据都能点开抽屉回溯源文；没有证据的维度会写「信息不足」，不会编造。</p>
              <p>同一需求与同一批仓库会命中 7 天缓存，命中时不扣减每日对比次数。</p>
              <p>生成后可导出 Markdown，或创建只读分享链接给同事评审。</p>
            </div>
          </section>
          <section className="border border-border bg-card p-4">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground">
              Links / 相关
            </h2>
            <div className="mt-3 flex flex-col gap-2">
              <Link
                href="/repos"
                className="inline-flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-primary"
              >
                仓库
                <ArrowUpRight className="size-3" aria-hidden />
              </Link>
              <Link
                href="/match"
                className="inline-flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-primary"
              >
                语义匹配
                <ArrowUpRight className="size-3" aria-hidden />
              </Link>
            </div>
          </section>
        </aside>

        <div className="order-1 min-w-0 md:order-2">
          <CompareWorkbench
            initialRepos={initialRepos}
            initialIdeaId={initialIdeaId}
            initialRawText={initialRawText}
            initialComparison={previousComparison}
          />
        </div>
      </div>
    </div>
  );
}
