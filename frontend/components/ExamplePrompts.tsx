import Link from 'next/link';

export interface ExamplePrompt {
  label: string;
  query: string;
}

export default function ExamplePrompts({ items }: { items: ExamplePrompt[] }) {
  return (
    <div className="mx-auto mt-6 flex max-w-3xl flex-wrap justify-center gap-2">
      {items.map((item) => (
        <Link
          key={item.label}
          href={`/repos?q=${encodeURIComponent(item.query)}`}
          className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-secondary transition-colors duration-150 hover:border-accent hover:text-accent"
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
