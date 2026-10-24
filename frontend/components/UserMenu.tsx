'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bookmark, History, LogOut, MessageSquare, Scale, Sparkles, User } from 'lucide-react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logout } from '@/lib/client';

export default function UserMenu({
  nickname,
  avatarUrl,
}: {
  nickname: string;
  avatarUrl?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      await logout();
      window.location.href = '/';
    } catch {
      toast.error('退出失败，请重试');
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-1.5">
          <Avatar className="size-6 rounded-none">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
            <AvatarFallback className="rounded-none bg-primary font-mono text-[10px] text-primary-foreground">
              {nickname.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[7rem] truncate text-[13px] lg:inline">{nickname}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm">{nickname}</span>
          <span className="font-mono text-[10px] font-normal uppercase tracking-[0.12em] text-muted-foreground">
            GitHub account
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/me">
            <User className="size-4" aria-hidden />
            个人中心
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/me/favorites">
            <Bookmark className="size-4" aria-hidden />
            我的收藏
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/me/comparisons">
            <Scale className="size-4" aria-hidden />
            对比历史
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/me/ideas">
            <Sparkles className="size-4" aria-hidden />
            我的想法
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/me/conversations">
            <MessageSquare className="size-4" aria-hidden />
            会话历史
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void handleLogout();
          }}
          disabled={busy}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="size-4" aria-hidden />
          {busy ? '退出中…' : '退出登录'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
