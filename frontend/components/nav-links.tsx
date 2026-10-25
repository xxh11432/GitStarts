'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/', label: '首页', index: '00' },
  { href: '/repos', label: '仓库', index: '01' },
  { href: '/rank', label: '排行榜', index: '02' },
  { href: '/match', label: '语义匹配', index: '03' },
  { href: '/compare', label: '深度对比', index: '04' },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {ITEMS.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== '/' && pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 px-2.5 py-1.5 text-[13px] transition-colors',
              active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <span className="font-mono text-[10px] opacity-60">{item.index}</span>
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
