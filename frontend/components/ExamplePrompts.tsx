import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

export interface ExamplePrompt {
  label: string;
  query: string;
}

export default function ExamplePrompts({ items }: { items: ExamplePrompt[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        Try / 示例
      </span>
      {items.map((item) => (
        <Link
          key={item.label}
          href={`/chat?q=${encodeURIComponent(item.query)}`}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          {item.label}
          <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      ))}
    </div>
  );
}
