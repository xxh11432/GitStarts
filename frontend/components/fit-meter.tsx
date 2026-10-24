import { cn } from '@/lib/utils';

const ROWS = [
  { key: 'semantic' as const, label: '语义', weight: '45%', color: 'bg-primary' },
  { key: 'coverage' as const, label: '条件', weight: '25%', color: 'bg-info' },
  { key: 'maintenance' as const, label: '维护', weight: '15%', color: 'bg-foreground/60' },
  { key: 'license' as const, label: '许可', weight: '15%', color: 'bg-muted-foreground' },
];

export interface FitBreakdownView {
  semantic: number;
  coverage: number;
  maintenance: number;
  license: number;
}

export default function FitMeter({ breakdown }: { breakdown: FitBreakdownView }) {
  return (
    <dl className="flex flex-col gap-2">
      {ROWS.map((row) => {
        const percent = Math.round(
          Math.max(0, Math.min(1, breakdown[row.key])) * 100,
        );
        return (
          <div key={row.key} className="grid grid-cols-[52px_1fr_40px] items-center gap-2">
            <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {row.label}
              <span className="ml-1 opacity-60">{row.weight}</span>
            </dt>
            <dd className="h-1.5 bg-muted">
              <div className={cn('h-full', row.color)} style={{ width: `${percent}%` }} />
            </dd>
            <dd className="text-right font-mono text-[11px] tabular-nums text-foreground">
              {percent}%
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
