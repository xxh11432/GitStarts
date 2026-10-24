import Link from 'next/link';
import { notFound } from 'next/navigation';
import CompareMatrix from '@/components/compare/CompareMatrix';
import { fetchSharedComparison } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function SharedComparisonPage({
  params,
}: {
  params: { token: string };
}) {
  const shared = await fetchSharedComparison(params.token).catch(() => null);
  if (!shared) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs font-medium uppercase tracking-widest text-accent">只读分享</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">
          {shared.result.repos.map((repo) => repo.fullName).join(' vs ') || '仓库对比'}
        </h1>
        <p className="mt-2 max-w-2xl text-body text-ink-secondary">
          这是他人分享的对比结果，只展示对比内容，不包含账号与需求原文。
          {shared.createdAt ? ` 生成于 ${shared.createdAt}。` : ''}
        </p>
      </section>

      <CompareMatrix result={shared.result} />

      <p className="text-xs text-ink-muted">
        <Link href="/compare" className="text-accent hover:underline">
          自己做一个对比
        </Link>
        ，或返回
        <Link href="/" className="ml-1 text-accent hover:underline">
          首页
        </Link>
        。
      </p>
    </div>
  );
}
