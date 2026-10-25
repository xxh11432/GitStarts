'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Filter, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
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
  view?: string;
}

const LICENSES = ['MIT', 'Apache-2.0', 'GPL-3.0', 'AGPL-3.0', 'BSD-3-Clause', 'MPL-2.0'];
const SORTS = [
  { value: 'stars', label: 'Stars 最多' },
  { value: 'pushedAt', label: '最近更新' },
  { value: 'created', label: '最新创建' },
  { value: 'forks', label: 'Fork 最多' },
];

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function ChipGroup({
  items,
  active,
  onSelect,
  showCount = false,
}: {
  items: { value: string; label: string; count?: number }[];
  active?: string;
  onSelect: (value: string | undefined) => void;
  showCount?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      value={active ?? ''}
      onValueChange={(value) => onSelect(value || undefined)}
      className="flex flex-wrap justify-start gap-1.5"
    >
      {items.map((item) => (
        <ToggleGroupItem
          key={item.value}
          value={item.value}
          className="h-auto rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-normal text-muted-foreground data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          {item.label}
          {showCount && typeof item.count === 'number' ? (
            <span className="ml-1.5 font-mono text-[9px] opacity-60">{item.count}</span>
          ) : null}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export default function FilterBar({
  meta,
  current = {},
}: {
  meta: MetaResponse;
  current?: CurrentFilters;
}) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(current.q ?? '');
  const [open, setOpen] = useState(false);
  const activeCount = [current.category, current.language, current.platform, current.license].filter(
    Boolean,
  ).length;

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

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ q: keyword.trim() || undefined });
  }

  const fields = (
    <div className="flex flex-col gap-5">
      <form onSubmit={submitSearch} className="flex flex-col gap-2">
        <Label
          htmlFor="repo-search"
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
        >
          Search / 搜索
        </Label>
        <div className="flex gap-2">
          <Input
            id="repo-search"
            type="text"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="仓库名、描述"
            className="h-9 rounded-lg font-mono text-[12px]"
          />
          <Button type="submit" size="sm" className="h-9 rounded-lg px-3">
            <Search className="size-3.5" data-icon="inline-start" />
            搜索
          </Button>
        </div>
      </form>

      {meta.platforms.length > 0 ? (
        <FilterGroup label="Platform / 平台">
          <ChipGroup
            items={meta.platforms.map((platform) => ({
              value: platform.slug,
              label: platform.name,
              count: platform.count,
            }))}
            active={current.platform}
            onSelect={(value) => navigate({ platform: value })}
            showCount
          />
        </FilterGroup>
      ) : null}

      {meta.categories.length > 0 ? (
        <FilterGroup label="Category / 分类">
          <ChipGroup
            items={meta.categories.map((category) => ({
              value: category.slug,
              label: category.name,
              count: category.count,
            }))}
            active={current.category}
            onSelect={(value) => navigate({ category: value })}
            showCount
          />
        </FilterGroup>
      ) : null}

      {meta.languages.length > 0 ? (
        <FilterGroup label="Language / 语言">
          <ChipGroup
            items={meta.languages.slice(0, 15).map((language) => ({
              value: language.slug,
              label: language.name,
            }))}
            active={current.language}
            onSelect={(value) => navigate({ language: value })}
          />
        </FilterGroup>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        <div className="flex flex-col gap-2">
          <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            License / 许可
          </Label>
          <Select
            value={current.license ?? 'all'}
            onValueChange={(value) => navigate({ license: value === 'all' ? undefined : value })}
          >
            <SelectTrigger className="h-9 rounded-lg text-[12px]">
              <SelectValue placeholder="全部许可" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部许可</SelectItem>
              {current.license && !LICENSES.includes(current.license) ? (
                <SelectItem value={current.license}>{current.license}</SelectItem>
              ) : null}
              {LICENSES.map((license) => (
                <SelectItem key={license} value={license}>
                  {license}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Sort / 排序
          </Label>
          <Select
            value={current.sort ?? 'stars'}
            onValueChange={(value) => navigate({ sort: value, order: 'desc' })}
          >
            <SelectTrigger className="h-9 rounded-lg text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((sort) => (
                <SelectItem key={sort.value} value={sort.value}>
                  {sort.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {activeCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-start rounded-lg px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
          onClick={() => {
            setKeyword('');
            router.push('/repos');
          }}
        >
          <X className="size-3.5" data-icon="inline-start" />
          清除全部筛选
        </Button>
      ) : null}
    </div>
  );

  return (
    <>
      <div className="flex items-center gap-2 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-lg">
              <Filter className="size-3.5" data-icon="inline-start" />
              筛选{activeCount > 0 ? ` · ${activeCount}` : ''}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[86vh] overflow-y-auto rounded-lg">
            <SheetHeader className="text-left">
              <SheetTitle className="font-display text-lg">筛选与排序</SheetTitle>
              <SheetDescription className="font-mono text-[10px] uppercase tracking-[0.14em]">
                Filter index
              </SheetDescription>
            </SheetHeader>
            <div className="mt-5">{fields}</div>
          </SheetContent>
        </Sheet>
        {activeCount > 0 || current.q ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {activeCount + (current.q ? 1 : 0)} 项已应用
          </span>
        ) : null}
      </div>

      <aside className="hidden md:block">
        <div className="sticky top-20 overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground">
              Filter / 筛选
            </span>
            {activeCount > 0 ? (
              <span className="font-mono text-[10px] text-primary">{activeCount} active</span>
            ) : null}
          </div>
          <div className={cn('p-4')}>{fields}</div>
        </div>
      </aside>
    </>
  );
}
