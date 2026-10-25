import Link from 'next/link';

import type { FacetItem } from '@/lib/types';
import { languageColor } from '@/lib/labels';
import { cn } from '@/lib/utils';

export type TagKind = 'language' | 'topic';

export interface RankTag extends FacetItem {
  kind: TagKind;
}

/** 非语言主题标签的配色，按名称稳定取色。 */
const TOPIC_PALETTE = [
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#10b981',
  '#06b6d4',
  '#eab308',
  '#ef4444',
  '#14b8a6',
  '#a855f7',
];

function hashColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 9973;
  }
  return TOPIC_PALETTE[hash % TOPIC_PALETTE.length];
}

/** 用标签自身配色与前景色混合，保证浅色/深色主题下都有足够对比度。 */
function tagColor(tag: RankTag, weight: number): string {
  const base = tag.kind === 'language' ? languageColor(tag.name) : hashColor(tag.slug);
  return `color-mix(in srgb, ${base} ${weight}%, hsl(var(--foreground)))`;
}

const ROW_STYLES = [
  {
    size: 'text-[16px] sm:text-[19px]',
    count: 'text-[11px] sm:text-[11.5px]',
    weight: 85,
    font: 'font-semibold',
    dim: '',
  },
  {
    size: 'text-[14.5px] sm:text-[17px]',
    count: 'text-[10.5px] sm:text-[11px]',
    weight: 74,
    font: 'font-medium',
    dim: 'opacity-95',
  },
  {
    size: 'text-[13.5px] sm:text-[15.5px]',
    count: 'text-[10px] sm:text-[10.5px]',
    weight: 64,
    font: 'font-medium',
    dim: 'opacity-90',
  },
  {
    size: 'text-[12.5px] sm:text-[14.5px]',
    count: 'text-[10px]',
    weight: 56,
    font: 'font-normal',
    dim: 'opacity-88',
  },
  {
    size: 'text-[12px] sm:text-[13.5px]',
    count: 'text-[9.5px]',
    weight: 48,
    font: 'font-normal',
    dim: 'opacity-84',
  },
  {
    size: 'text-[11.5px] sm:text-[12.5px]',
    count: 'text-[9px] sm:text-[9.5px]',
    weight: 42,
    font: 'font-normal',
    dim: 'opacity-80',
  },
  {
    size: 'text-[11px] sm:text-[12px]',
    count: 'text-[9px]',
    weight: 36,
    font: 'font-normal',
    dim: 'opacity-76',
  },
];

const ROW_COUNT = 7;
const MAX_TAGS = 63;

/**
 * 排行榜标签云：仅取最热门标签，按热度均分为七行并整体居中，
 * 首行字号最大、颜色最鲜艳、项目数最多，向下逐行减弱。
 */
export default function TagCloud({
  tags,
  type,
  selectedLanguage,
  selectedTopic,
}: {
  tags: RankTag[];
  type: string;
  selectedLanguage?: string;
  selectedTopic?: string;
}) {
  const sorted = [...tags]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, MAX_TAGS);

  const perRow = Math.max(1, Math.ceil(sorted.length / ROW_COUNT));
  const rows = Array.from({ length: ROW_COUNT }, (_, index) =>
    sorted.slice(index * perRow, (index + 1) * perRow),
  ).filter((row) => row.length > 0);

  const selected = selectedLanguage ?? selectedTopic;
  const allHref = `/rank?type=${encodeURIComponent(type)}`;

  const hrefFor = (tag: RankTag) => {
    const qs = new URLSearchParams({ type });
    qs.set(tag.kind === 'language' ? 'language' : 'topic', tag.name);
    return `/rank?${qs.toString()}`;
  };

  return (
    <section aria-label="标签筛选排行榜" className="flex flex-col gap-2.5">
      {rows.map((row, rowIndex) => {
        const style = ROW_STYLES[rowIndex] ?? ROW_STYLES[ROW_STYLES.length - 1];
        return (
          <div
            key={rowIndex}
            className="flex w-full flex-wrap items-baseline justify-center gap-x-4 gap-y-1.5"
          >
            {row.map((tag) => {
              const active = tag.name === selected;
              return (
                <Link
                  key={`${tag.kind}-${tag.name}`}
                  href={active ? allHref : hrefFor(tag)}
                  aria-current={active ? 'page' : undefined}
                  title={
                    active
                      ? `取消「${tag.name}」筛选`
                      : `只看${tag.kind === 'language' ? '语言' : '主题'}「${tag.name}」的项目（${tag.count}）`
                  }
                  style={{ color: tagColor(tag, style.weight) }}
                  className={cn(
                    'inline-flex items-baseline gap-1.5 rounded-sm leading-tight transition-opacity hover:opacity-75',
                    style.size,
                    style.font,
                    style.dim,
                    active && 'bg-accent px-1.5 py-0.5 opacity-100 ring-1 ring-primary/40 hover:opacity-100',
                  )}
                >
                  {tag.name}
                  <span
                    className={cn('font-mono tabular-nums text-muted-foreground', style.count)}
                  >
                    {tag.count}
                  </span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}
