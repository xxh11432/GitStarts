export default function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="px-4 py-5 sm:px-5">
      <dd className="font-display text-2xl font-semibold tabular-nums text-foreground">
        {typeof value === 'number' ? value.toLocaleString('zh-CN') : value}
      </dd>
      <dt className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
    </div>
  );
}
