import Link from 'next/link';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-background/85 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-container items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold text-ink">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-accent" />
          GitStars
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/"
            className="rounded-md px-2 py-1 text-sm text-ink-secondary transition-colors hover:text-ink"
          >
            首页
          </Link>
          <Link
            href="/repos"
            className="rounded-md px-2 py-1 text-sm text-ink-secondary transition-colors hover:text-ink"
          >
            仓库列表
          </Link>
          <Link
            href="/#composer"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            描述需求
          </Link>
        </div>
      </nav>
    </header>
  );
}
