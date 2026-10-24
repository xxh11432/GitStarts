export default function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 border border-dashed border-border bg-card px-6 py-12 text-center">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        No records
      </span>
      <h3 className="text-section font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
