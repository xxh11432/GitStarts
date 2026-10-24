import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import CompareMatrix from '@/components/compare/CompareMatrix';
import ComparisonShareActions from '@/components/me/ComparisonShareActions';
import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
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

  const title =
    comparison.result.repos.map((repo) => repo.fullName).join(' vs ') ||
    comparison.repoKeys.join(' vs ');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        index="07.1"
        eyebrow="Comparison detail"
        title={title || '仓库对比'}
        description={`${comparison.createdAt ? `生成于 ${comparison.createdAt} · ` : ''}schema ${comparison.schemaVersion}${
          comparison.ideaId ? ` · 关联想法 #${comparison.ideaId}` : ''
        }`}
        actions={
          <Button asChild variant="ghost" size="sm" className="rounded-none">
            <Link href="/me/comparisons">返回对比历史</Link>
          </Button>
        }
      />

      <ComparisonShareActions comparisonId={comparison.id} initialToken={comparison.shareToken} />

      <CompareMatrix result={comparison.result} />
    </div>
  );
}
