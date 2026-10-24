import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import CompareMatrix from '@/components/compare/CompareMatrix';
import ComparisonShareActions from '@/components/me/ComparisonShareActions';
import { fetchComparison, fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function ComparisonDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await fetchMe();
  if (!me) {
    redirect(`/login?next=/me/comparisons/${params.id}`);
  }
  if (!/^\d+$/.test(params.id)) {
    notFound();
  }
  const comparison = await fetchComparison(params.id);
  if (!comparison) {
    notFound();
  }

  const title = comparison.result.repos.map((repo) => repo.fullName).join(' vs ') || comparison.repoKeys.join(' vs ');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest text-accent">对比详情</p>
          <h1 className="mt-2 truncate text-2xl font-semibold text-ink">{title || '仓库对比'}</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            {comparison.createdAt ? `生成于 ${comparison.createdAt} · ` : ''}
            schema {comparison.schemaVersion}
            {comparison.ideaId ? ` · 关联想法 #${comparison.ideaId}` : ''}
          </p>
        </div>
        <Link href="/me/comparisons" className="text-xs text-accent hover:underline">
          返回对比历史
        </Link>
      </div>

      <ComparisonShareActions comparisonId={comparison.id} initialToken={comparison.shareToken} />

      <CompareMatrix result={comparison.result} />
    </div>
  );
}
