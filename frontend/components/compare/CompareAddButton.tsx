'use client';

import { useRouter } from 'next/navigation';

export const COMPARE_STORAGE_KEY = 'gitstars:compare-repos';

/**
 * 把仓库加入对比篮：持久化到 localStorage 后跳到对比工作台。
 * 最多保留 4 个，新加入的排在最后。
 */
export default function CompareAddButton({
  fullName,
  ideaId,
}: {
  fullName: string;
  ideaId?: number | null;
}) {
  const router = useRouter();

  const onClick = () => {
    let stored: string[] = [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem(COMPARE_STORAGE_KEY) ?? '[]');
      if (Array.isArray(parsed)) {
        stored = parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      stored = [];
    }
    const merged = Array.from(new Set([...stored, fullName])).slice(-4);
    window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(merged));

    const params = new URLSearchParams({ repos: merged.join(',') });
    if (ideaId) {
      params.set('ideaId', String(ideaId));
    }
    router.push(`/compare?${params.toString()}`);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-accent/30 bg-accent/5 px-3 py-1.5 text-sm text-accent transition-colors hover:border-accent"
    >
      加入对比
    </button>
  );
}
