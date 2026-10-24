import Link from 'next/link';
import { fetchMe } from '@/lib/api';
import LoginButton from './LoginButton';
import UserMenu from './UserMenu';

export default async function Navbar() {
  const me = await fetchMe();

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-background/85 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-container items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold text-ink">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-accent" />
          GitStars
        </Link>
        <div className="flex items-center gap-1 sm:gap-3">
          <Link
            href="/"
            className="hidden rounded-md px-2 py-1 text-sm text-ink-secondary transition-colors hover:text-ink sm:block"
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
            href="/match"
            className="rounded-md px-2 py-1 text-sm text-ink-secondary transition-colors hover:text-ink"
          >
            匹配
          </Link>
          <Link
            href="/compare"
            className="rounded-md px-2 py-1 text-sm text-ink-secondary transition-colors hover:text-ink"
          >
            对比
          </Link>
          <Link
            href="/#composer"
            className="hidden rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover sm:block"
          >
            描述需求
          </Link>
          {me ? (
            <UserMenu nickname={me.nickname ?? '我'} avatarUrl={me.avatarUrl} />
          ) : (
            <LoginButton next="/" compact />
          )}
        </div>
      </nav>
    </header>
  );
}
