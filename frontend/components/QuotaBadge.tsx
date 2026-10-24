'use client';

import { useEffect, useState } from 'react';
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
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-secondary">{label}</span>
        <span className="tabular-nums text-ink">
          {view.used}
          <span className="text-ink-muted"> / {view.limit}</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
        <div
          className={`h-full rounded-full transition-all duration-200 ${nearLimit ? 'bg-danger' : 'bg-accent'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
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
      <div className="rounded-card border border-line bg-surface px-4 py-4 text-sm text-ink-muted">
        {error ?? '正在读取配额…'}
      </div>
    );
  }

  return (
    <section className="rounded-card border border-line bg-background p-4 shadow-card">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-ink">今日额度</h2>
        <span className="text-xs text-ink-muted">每日 00:00 重置</span>
      </div>
      <div className="space-y-4">
        <QuotaRow label="AI 对话" view={quota.chat} />
        <QuotaRow label="深度对比" view={quota.compare} />
      </div>
      {error && <p className="mt-3 text-xs text-danger">{error}</p>}
    </section>
  );
}
