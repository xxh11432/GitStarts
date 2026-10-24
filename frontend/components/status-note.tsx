import { Loader2 } from 'lucide-react';

export default function StatusNote({ label, detail }: { label: string; detail?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-border bg-card px-4 py-3"
    >
      <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        {label}
      </span>
      {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
    </div>
  );
}
