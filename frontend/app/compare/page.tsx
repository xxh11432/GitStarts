import Link from 'next/link';
import { redirect } from 'next/navigation';
import QuotaBadge from '@/components/QuotaBadge';
import CompareWorkbench from '@/components/compare/CompareWorkbench';
import { fetchMe } from '@/lib/api';

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

  const initialRepos = (searchParams.repos ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => /^[\w.-]+\/[\w.-]+$/.test(item))
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 4);
  const parsedIdeaId = Number.parseInt(searchParams.ideaId ?? '', 10);
  const initialIdeaId = Number.isFinite(parsedIdeaId) && parsedIdeaId > 0 ? parsedIdeaId : null;

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs font-medium uppercase tracking-widest text-accent">对比工作台</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">把 2–4 个候选放在一起看</h1>
        <p className="mt-2 max-w-2xl text-body text-ink-secondary">
          对比会按定位、技术栈、部署、能力覆盖、许可、活跃度、扩展性与风险 8 个维度展开，
          每个单元格都附带 README / manifest 证据或显式标注「信息不足」。
        </p>
      </section>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <QuotaBadge initial={me.quota} />
          <section className="rounded-card border border-line bg-background p-4 text-xs leading-relaxed text-ink-muted shadow-card">
            <h2 className="mb-2 text-sm font-semibold text-ink">怎么用</h2>
            <p>先在「语义匹配」里挑候选，点「加入对比」把仓库带到这里；也可以直接输入 owner/name。</p>
            <p className="mt-2">每格证据都能点开抽屉回溯源文；没有证据的维度会写「信息不足」，不会编造。</p>
            <p className="mt-2">同一需求与同一批仓库会命中 7 天缓存，命中时不扣减每日对比次数。</p>
            <p className="mt-2">生成后可导出 Markdown，或创建只读分享链接给同事评审。</p>
          </section>
        </div>

        <CompareWorkbench initialRepos={initialRepos} initialIdeaId={initialIdeaId} />
      </div>

      <p className="text-xs text-ink-muted">
        需要先挑选仓库？
        <Link href="/repos" className="ml-1 text-accent hover:underline">
          去仓库库
        </Link>
        ，或
        <Link href="/match" className="ml-1 text-accent hover:underline">
          去语义匹配
        </Link>
        。
      </p>
    </div>
  );
}
