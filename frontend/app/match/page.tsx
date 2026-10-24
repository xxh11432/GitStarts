import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import PageHeader from '@/components/page-header';
import QuotaBadge from '@/components/QuotaBadge';
import MatchWorkbench from '@/components/match/MatchWorkbench';
import { Button } from '@/components/ui/button';
import { fetchMe } from '@/lib/api';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function MatchPage() {
  const me = await fetchMe();
  if (!me) {
    redirect('/login?next=/match');
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        index="03"
        eyebrow="Semantic match"
        title="把需求变成可核对的候选清单"
        description="先用一句话描述目标，AI 只抽取你明确说过的条件，再到站内 README 索引里召回、重排，并按语义、条件覆盖、维护活跃、许可与文档四项给出契合度。"
        meta={
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            fit = 45% semantic + 25% coverage + 15% maintenance + 15% license
          </p>
        }
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-none">
            <Link href="/compare">
              直接去对比
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
              How to read / 怎么读结果
            </h2>
            <div className="mt-3 flex flex-col gap-2.5 text-xs leading-relaxed text-muted-foreground">
              <p>契合度是排序参考，不是质量结论。许可证、部署方式与功能边界以仓库原文为准。</p>
              <p>硬条件核对里的「无法确认」表示元数据不足，需要打开 README 人工确认。</p>
              <p>同一需求 10 分钟内重复匹配会复用缓存结果。</p>
            </div>
          </section>
        </aside>

        <div className="order-1 min-w-0 md:order-2">
          <MatchWorkbench />
        </div>
      </div>
    </div>
  );
}
