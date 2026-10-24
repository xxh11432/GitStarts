'use client';

import { useEffect, useState } from 'react';

import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { Quota, QuotaView } from '@/lib/types';

function ratio(view: QuotaView): number {
  if (view.limit <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((view.used / view.limit) * 100));
}

function QuotaRow({ label, view }: { label: string; view: QuotaView }) {
  const percent = ratio(view);
  const nearLimit = percent >= 80;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">{label}</span>
        <span className="font-mono text-[11px] tabular-nums text-foreground">
          {view.used}
          <span className="text-muted-foreground"> / {view.limit}</span>
        </span>
      </div>
      <Progress
        value={percent}
        className={cn(
          'mt-2 h-1.5 rounded-none bg-muted',
          nearLimit && '[&>div]:bg-destructive',
        )}
      />
    </div>
  );
}

export default function QuotaBadge({ initial }: { initial?: Quota }) {
  const [quota, setQuota] = useState<Quota | undefined>(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/quota', { credentials: 'include', cache: 'no-store' })
      .then((res) => {
        if (!res.ok) {
          throw new Error(String(res.status));
        }
        return res.json() as Promise<Quota>;
      })
      .then((data) => {
        if (active) {
          setQuota(data);
          setError(null);
        }
      })
      .catch(() => {
        if (active) {
          setError('配额获取失败，请刷新页面');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (!quota) {
    return (
      <div className="border border-border bg-card px-4 py-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {error ?? '读取配额中…'}
      </div>
    );
  }

  return (
    <section className="border border-border bg-card p-4">
      <div className="mb-4 flex items-baseline justify-between gap-2 border-b border-border pb-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground">
          Quota / 今日额度
        </h2>
        <span className="font-mono text-[10px] text-muted-foreground">00:00 重置</span>
      </div>
      <div className="flex flex-col gap-4">
        <QuotaRow label="AI 对话" view={quota.chat} />
        <QuotaRow label="深度对比" view={quota.compare} />
      </div>
      {error ? <p className="mt-3 text-[11px] text-destructive">{error}</p> : null}
    </section>
  );
}
