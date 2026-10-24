import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';

import EmptyState from '@/components/empty-state';
import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { fetchMe, fetchMyIdeas } from '@/lib/api';

export const dynamic = 'force-dynamic';

function formatTime(value?: string): string {
  return value ? value.slice(0, 16).replace('T', ' ') : '—';
}

export default async function IdeasPage() {
  const me = await fetchMe();
  if (!me) {
    redirect('/login?next=/me/ideas');
  }
  const page = await fetchMyIdeas(1, 50);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        index="06"
        eyebrow="My ideas"
        title="结构化需求"
        description="想法会被结构化保存，可直接带入匹配或对比。"
        actions={
          <Button asChild variant="ghost" size="sm" className="rounded-none">
            <Link href="/me">返回个人中心</Link>
          </Button>
        }
      />

      {page?.items.length ? (
        <div className="flex flex-col gap-3">
          {page.items.map((idea, index) => (
            <article key={idea.id} className="border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h2 className="text-sm font-semibold text-foreground">
                      {idea.title || `想法 #${idea.id}`}
                    </h2>
                  </div>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    rev {idea.revision} · {formatTime(idea.updatedAt)}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="rounded-none">
                  <Link href={`/compare?ideaId=${idea.id}`}>
                    继续对比
                    <ArrowUpRight className="size-3.5" data-icon="inline-end" />
                  </Link>
                </Button>
              </div>
              <p className="mt-3 whitespace-pre-wrap border-l-2 border-border pl-3 text-[12px] leading-relaxed text-muted-foreground">
                {idea.rawText}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="还没有保存的想法"
          description="去「语义匹配」描述你的需求，结构化结果会自动沉淀。"
          action={
            <Button asChild variant="outline" size="sm" className="rounded-none">
              <Link href="/match">开始匹配</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
