import Link from 'next/link';

import LoginButton from './LoginButton';
import MobileNav from './mobile-nav';
import CommandMenu from './command-menu';
import NavLinks from './nav-links';
import ThemeToggle from './theme-toggle';
import UserMenu from './UserMenu';
import { fetchMe } from '@/lib/api';

export default async function Navbar() {
  const me = await fetchMe();
  const nickname = me?.nickname ?? 'GitHub 用户';

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-14 max-w-container items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="GitStars 首页">
          <img
            src="/icon.svg"
            alt=""
            width={26}
            height={26}
            className="size-[26px] shrink-0 rounded-[7px]"
          />
          <span className="font-display text-[15px] font-semibold tracking-tight text-foreground">
            GitStars
          </span>
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground lg:inline">
            Ledger
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-0.5 md:flex" aria-label="主导航">
          <NavLinks />
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <CommandMenu />
          {me ? (
            <UserMenu nickname={nickname} avatarUrl={me.avatarUrl} />
          ) : (
            <LoginButton next="/" compact />
          )}
          <MobileNav
            authenticated={Boolean(me)}
            nickname={nickname}
            avatarUrl={me?.avatarUrl}
          />
        </div>
      </div>
    </header>
  );
}
