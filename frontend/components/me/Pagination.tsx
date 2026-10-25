import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function Pagination({
  page,
  totalPages,
  base,
}: {
  page: number;
  totalPages: number;
  base: string;
}) {
  if (totalPages <= 1) {
    return null;
  }
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-border pt-4 text-sm" aria-label="分页">
      {page > 1 ? (
        <Button asChild variant="outline" size="sm" className="rounded-lg">
          <Link href={`${base}?page=${page - 1}`}>
            <ArrowLeft className="size-3.5" data-icon="inline-start" />
            上一页
          </Link>
        </Button>
      ) : (
        <span className="text-[10px] text-muted-foreground">已是第一页</span>
      )}
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Page {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Button asChild variant="outline" size="sm" className="rounded-lg">
          <Link href={`${base}?page=${page + 1}`}>
            下一页
            <ArrowRight className="size-3.5" data-icon="inline-end" />
          </Link>
        </Button>
      ) : (
        <span className="text-[10px] text-muted-foreground">已到最后一页</span>
      )}
    </nav>
  );
}
