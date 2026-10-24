'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { MetaResponse } from '@/lib/types';

interface CurrentFilters {
  q?: string;
  category?: string;
  language?: string;
  topic?: string;
  platform?: string;
  license?: string;
  sort?: string;
  order?: string;
}

interface FilterBarProps {
  meta: MetaResponse;
  current?: CurrentFilters;
}

const LICENSES = ['MIT', 'Apache-2.0', 'GPL-3.0', 'AGPL-3.0', 'BSD-3-Clause', 'MPL-2.0'];
const SORTS = [
  { value: 'stars', label: 'Stars 最多' },
  { value: 'pushedAt', label: '最近更新' },
  { value: 'created', label: '最新创建' },
  { value: 'forks', label: 'Fork 最多' },
];

export default function FilterBar({ meta, current = {} }: FilterBarProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState(current.q ?? '');
  const activeCount = [current.category, current.language, current.platform, current.license].filter(Boolean).length;

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  function navigate(overrides: Partial<CurrentFilters>) {
    const merged: CurrentFilters = { ...current, ...overrides };
    const qs = new URLSearchParams();
    Object.entries(merged).forEach(([key, value]) => {
      if (value) {
        qs.set(key, value);
      }
    });
    const suffix = qs.toString();
    setOpen(false);
    router.push(`/repos${suffix ? `?${suffix}` : ''}`);
  }

  function toggle(key: keyof CurrentFilters, value: string) {
    navigate({ [key]: current[key] === value ? undefined : value });
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ q: keyword.trim() || undefined });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 sm:hidden">
        <span className="text-sm text-ink-secondary">筛选与排序</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="repo-filter-panel"
          className="rounded-md border border-line bg-background px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
        >
          筛选{activeCount > 0 ? ` · ${activeCount}` : ''}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-30 bg-ink/30 sm:hidden" aria-hidden onClick={() => setOpen(false)} />
      )}

      <section
        id="repo-filter-panel"
        className={`${
          open
            ? 'fixed inset-x-0 bottom-0 z-40 max-h-[82vh] overflow-y-auto rounded-t-card border-t border-line bg-background p-4'
            : 'hidden'
        } sm:static sm:z-auto sm:block sm:max-h-none sm:overflow-visible sm:rounded-card sm:border sm:border-line sm:bg-surface sm:p-4`}
      >
        <div className="mb-3 flex items-center justify-between sm:hidden">
          <h2 className="text-base font-semibold text-ink">筛选与排序</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="关闭筛选"
            className="rounded-md px-2 py-1 text-sm text-ink-secondary hover:text-ink"
          >
            关闭
          </button>
        </div>

        <form onSubmit={submitSearch} className="flex gap-2">
          <label htmlFor="repo-search" className="sr-only">
            搜索仓库
          </label>
          <input
            id="repo-search"
            type="text"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索仓库名、描述"
            className="min-w-0 flex-1 rounded-md border border-line bg-background px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            搜索
          </button>
        </form>

        <div className="mt-4 space-y-4">
          {meta.platforms.length > 0 && (
            <FilterGroup label="平台">
              {meta.platforms.map((platform) => (
                <Chip
                  key={platform.slug}
                  active={current.platform === platform.slug}
                  onClick={() => toggle('platform', platform.slug)}
                >
                  {platform.name}
                  <Count value={platform.count} />
                </Chip>
              ))}
            </FilterGroup>
          )}

          {meta.categories.length > 0 && (
            <FilterGroup label="分类">
              {meta.categories.map((category) => (
                <Chip
                  key={category.slug}
                  active={current.category === category.slug}
                  onClick={() => toggle('category', category.slug)}
                >
                  {category.name}
                  <Count value={category.count} />
                </Chip>
              ))}
            </FilterGroup>
          )}

          {meta.languages.length > 0 && (
            <FilterGroup label="语言">
              {meta.languages.slice(0, 15).map((language) => (
                <Chip
                  key={language.slug}
                  active={current.language === language.slug}
                  onClick={() => toggle('language', language.slug)}
                >
                  {language.name}
                </Chip>
              ))}
            </FilterGroup>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-muted">许可证</span>
              <select
                value={current.license ?? ''}
                onChange={(event) => navigate({ license: event.target.value || undefined })}
                className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              >
                <option value="">全部许可</option>
                {current.license && !LICENSES.includes(current.license) && (
                  <option value={current.license}>{current.license}</option>
                )}
                {LICENSES.map((license) => (
                  <option key={license} value={license}>
                    {license}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-muted">排序</span>
              <select
                value={current.sort ?? 'stars'}
                onChange={(event) => navigate({ sort: event.target.value, order: 'desc' })}
                className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              >
                {SORTS.map((sort) => (
                  <option key={sort.value} value={sort.value}>
                    {sort.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => router.push('/repos')}
              className="text-sm text-ink-secondary transition-colors hover:text-accent"
            >
              清除全部筛选
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-ink-muted">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-sm transition-colors duration-150 ${
        active
          ? 'border-accent bg-accent text-white'
          : 'border-line bg-background text-ink-secondary hover:border-accent hover:text-accent'
      }`}
    >
      {children}
    </button>
  );
}

function Count({ value }: { value: number }) {
  return <span className="ml-1.5 text-xs tabular-nums opacity-70">{value}</span>;
}
