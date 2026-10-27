'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const EXPLORE_LINKS = [
  { href: '/chat', label: 'AI 对话' },
  { href: '/repos', label: '仓库档案' },
  { href: '/rank', label: '排行榜' },
  { href: '/match', label: '语义匹配' },
  { href: '/compare', label: '深度对比' },
];

const ACCOUNT_LINKS = [
  { href: '/me/favorites', label: '我的收藏' },
  { href: '/me/comparisons', label: '我的对比' },
  { href: '/me/conversations', label: '我的会话' },
  { href: '/me/ideas', label: '我的想法' },
];

/**
 * 全站外壳：默认是带留白的文档流容器；对话页需要铺满视口，单独切换为沉浸式布局。
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const immersive = pathname === '/chat' || pathname.startsWith('/chat/');

  return (
    <>
      <main
        id="main-content"
        tabIndex={-1}
        className={
          immersive
            ? 'flex min-h-0 w-full flex-1 flex-col outline-none'
            : 'mx-auto w-full max-w-container flex-1 px-4 pb-20 pt-8 outline-none sm:px-6 lg:px-8'
        }
      >
        {children}
      </main>
      {immersive ? null : (
        <footer className="border-t border-border bg-card/40">
          <div className="mx-auto grid max-w-container gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.5fr_1fr_1fr] lg:px-8">
            <div className="flex flex-col gap-3">
              <Link href="/" className="flex w-fit items-center gap-2.5" aria-label="GitStars 首页">
                <img
                  src="/icon.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="size-6 shrink-0 rounded-[6px]"
                />
                <span className="font-display text-[15px] font-semibold tracking-tight text-foreground">
                  GitStars
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                  Ledger
                </span>
              </Link>
              <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
                用一句话找到能用的开源方案：匹配、深读、横向对比，每个结论都附证据。
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Open-source decision ledger
              </p>
            </div>

            <nav aria-label="探索">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                探索
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {EXPLORE_LINKS.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-label="账户">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                账户
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {ACCOUNT_LINKS.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="border-t border-border">
            <div className="mx-auto flex max-w-container flex-col gap-2 px-4 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
              <span>© {new Date().getFullYear()} GitStars · Evidence from public README &amp; manifests</span>
              <span>数据来源 GitHub</span>
            </div>
          </div>
        </footer>
      )}
    </>
  );
}
