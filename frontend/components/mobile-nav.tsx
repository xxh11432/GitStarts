'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bookmark, History, Home, Menu, MessageSquare, Scale, Sparkles, Trophy, User } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import LoginButton from './LoginButton';

const LINKS = [
  { href: '/', label: '首页', icon: Home },
  { href: '/repos', label: '仓库', icon: Bookmark },
  { href: '/rank', label: '排行榜', icon: Trophy },
  { href: '/match', label: '语义匹配', icon: Sparkles },
  { href: '/compare', label: '深度对比', icon: Scale },
];

const ACCOUNT_LINKS = [
  { href: '/me', label: '个人中心', icon: User },
  { href: '/me/favorites', label: '我的收藏', icon: Bookmark },
  { href: '/me/comparisons', label: '对比历史', icon: History },
  { href: '/me/conversations', label: '会话历史', icon: MessageSquare },
];

export default function MobileNav({
  authenticated,
  nickname,
  avatarUrl,
}: {
  authenticated: boolean;
  nickname?: string;
  avatarUrl?: string;
}) {
  const pathname = usePathname();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="打开菜单">
          <Menu className="size-4" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[86%] max-w-sm">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-lg">GitStars</SheetTitle>
          <SheetDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">
            Open-source decision ledger
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-6">
          <nav className="flex flex-col gap-1">
            {LINKS.map((item, index) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <SheetClose asChild key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 border border-transparent px-3 py-2.5 text-sm transition-colors',
                      active
                        ? 'border-border bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <Icon className="size-4" aria-hidden />
                    {item.label}
                  </Link>
                </SheetClose>
              );
            })}
          </nav>

          {authenticated ? (
            <div className="border-t border-border pt-4">
              <div className="mb-3 flex items-center gap-3">
                <Avatar className="size-9 rounded-lg">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
                  <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
                    {(nickname ?? '我').slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{nickname ?? 'GitHub 用户'}</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Signed in
                  </p>
                </div>
              </div>
              <nav className="flex flex-col gap-1">
                {ACCOUNT_LINKS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SheetClose asChild key={item.href}>
                      <Link
                        href={item.href}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Icon className="size-4" aria-hidden />
                        {item.label}
                      </Link>
                    </SheetClose>
                  );
                })}
              </nav>
            </div>
          ) : (
            <div className="border-t border-border pt-4">
              <LoginButton next={pathname} className="w-full" />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
