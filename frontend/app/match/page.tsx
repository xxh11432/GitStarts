import { redirect } from 'next/navigation';
import QuotaBadge from '@/components/QuotaBadge';
import MatchWorkbench from '@/components/match/MatchWorkbench';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function MatchPage() {
  const me = await fetchMe();
  if (!me) {
    redirect('/login?next=/match');
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs font-medium uppercase tracking-widest text-accent">语义匹配</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">把需求变成可核对的候选清单</h1>
        <p className="mt-2 max-w-2xl text-body text-ink-secondary">
          先用一句话描述目标，AI 只抽取你明确说过的条件，再到站内 README 索引里召回、重排，
          并按语义、条件覆盖、维护活跃、许可与文档四项给出契合度。
        </p>
      </section>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <QuotaBadge initial={me.quota} />
          <section className="rounded-card border border-line bg-background p-4 text-xs leading-relaxed text-ink-muted shadow-card">
            <h2 className="mb-2 text-sm font-semibold text-ink">怎么读结果</h2>
            <p>契合度是排序参考，不是质量结论。许可证、部署方式与功能边界以仓库原文为准。</p>
            <p className="mt-2">硬条件核对里的「无法确认」表示元数据不足，需要打开 README 人工确认。</p>
            <p className="mt-2">同一需求 10 分钟内重复匹配会复用缓存结果。</p>
          </section>
        </div>

        <MatchWorkbench />
      </div>
    </div>
  );
}
