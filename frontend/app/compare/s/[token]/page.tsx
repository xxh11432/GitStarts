import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight, Lock } from 'lucide-react';

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
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 border-b border-border pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 border border-primary/40 bg-primary/5 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
            <Lock className="size-3" aria-hidden />
            Shared dossier / 只读分享
          </span>
          {shared.createdAt ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Generated {shared.createdAt}
            </span>
          ) : null}
        </div>
        <h1 className="break-words font-display text-title font-semibold text-foreground">
          {shared.result.repos.map((repo) => repo.fullName).join(' vs ') || '仓库对比'}
        </h1>
        <p className="max-w-2xl text-body text-muted-foreground">
          这是他人分享的对比结果，只展示对比内容，不包含账号与需求原文。
        </p>
      </header>

      <CompareMatrix result={shared.result} />

      <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4">
        <Link
          href="/compare"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/70"
        >
          自己做一个对比
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          返回首页
        </Link>
      </div>
    </div>
  );
}
