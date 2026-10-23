import Link from 'next/link';
import type { MetaResponse } from '@/lib/types';

interface FilterBarProps {
  meta: MetaResponse;
  current?: {
    q?: string;
    category?: string;
    language?: string;
  };
}

export default function FilterBar({ meta, current = {} }: FilterBarProps) {
  const q = current.q ?? '';
  const category = current.category ?? '';
  const language = current.language ?? '';

  const chip = 'rounded-full border px-3 py-1 text-sm transition';
  const active = 'border-blue-500 bg-blue-500 text-white';
  const inactive = 'border-gray-200 bg-white text-gray-700 hover:border-blue-300';

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <form method="get" action="/repos" className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="搜索仓库名、描述"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          搜索
        </button>
      </form>

      {meta.languages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {meta.languages.slice(0, 15).map((lang) => (
            <Link
              key={lang.slug}
              href={`/repos?language=${lang.slug}`}
              className={`${chip} ${language === lang.slug ? active : inactive}`}
            >
              {lang.name}
            </Link>
          ))}
        </div>
      )}

      {meta.categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {meta.categories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/repos?category=${cat.slug}`}
              className={`${chip} ${category === cat.slug ? active : inactive}`}
            >
              {cat.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
