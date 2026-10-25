'use client';

import { usePathname } from 'next/navigation';

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
        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-container flex-col gap-2 px-4 py-8 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <span>GitStars · Open-source decision ledger</span>
            <span>Evidence from public README &amp; manifests</span>
          </div>
        </footer>
      )}
    </>
  );
}
