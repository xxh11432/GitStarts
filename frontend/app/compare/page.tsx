import Link from 'next/link';
import { redirect } from 'next/navigation';
import QuotaBadge from '@/components/QuotaBadge';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function ComparePage() {
  const me = await fetchMe();
  if (!me) {
    redirect('/login?next=/compare');
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs font-medium uppercase tracking-widest text-accent">对比工作台</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">把 2–4 个候选放在一起看</h1>
        <p className="mt-2 max-w-2xl text-body text-ink-secondary">
          对比会按定位、技术栈、部署、能力覆盖、许可、活跃度、扩展性与风险 8 个维度展开，
          每个单元格都附带 README 证据或显式标注「信息不足」。
        </p>
      </section>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <QuotaBadge initial={me.quota} />

        <section className="rounded-card border border-dashed border-line bg-surface px-5 py-10 text-center">
          <h2 className="text-base font-semibold text-ink">对比工作台将于 M5 上线</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
            当前阶段（M1）已完成账号、会话与每日配额。上线后这里支持逐维度证据抽屉、
            差异高亮、结论建议与 Markdown 导出。
          </p>
          <Link
            href="/repos"
            className="mt-5 inline-block rounded-md border border-line bg-background px-4 py-2 text-sm text-ink-secondary transition-colors hover:border-accent hover:text-accent"
          >
            先去挑选候选仓库
          </Link>
        </section>
      </div>
    </div>
  );
}
