import type { FitBreakdownView } from '@/lib/match';

const ROWS: { key: keyof FitBreakdownView; label: string; weight: string; color: string }[] = [
  { key: 'semantic', label: '语义相关', weight: '45%', color: 'bg-accent' },
  { key: 'coverage', label: '条件覆盖', weight: '25%', color: 'bg-info' },
  { key: 'maintenance', label: '维护活跃', weight: '15%', color: 'bg-ink-secondary' },
  { key: 'license', label: '许可与文档', weight: '15%', color: 'bg-ink-muted' },
];

export default function FitBreakdown({ breakdown }: { breakdown: FitBreakdownView }) {
  return (
    <dl className="space-y-2">
      {ROWS.map((row) => {
        const percent = Math.round(Math.max(0, Math.min(1, breakdown[row.key])) * 100);
        return (
          <div key={row.key} className="grid grid-cols-[72px_1fr_44px] items-center gap-2">
            <dt className="text-xs text-ink-secondary">
              {row.label}
              <span className="ml-1 text-[10px] text-ink-muted">{row.weight}</span>
            </dt>
            <dd className="h-1.5 overflow-hidden rounded-full bg-surface">
              <div
                className={`h-full rounded-full ${row.color}`}
                style={{ width: `${percent}%` }}
              />
            </dd>
            <dd className="text-right text-xs tabular-nums text-ink-secondary">{percent}%</dd>
          </div>
        );
      })}
    </dl>
  );
}
