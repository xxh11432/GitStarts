'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, Home, MessageSquare, Search, Scale, Sparkles, SquareArrowOutUpRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const QUICK_LINKS = [
  { href: '/', label: '首页', icon: Home },
  { href: '/repos', label: '仓库档案库', icon: Search },
  { href: '/match', label: '语义匹配工作台', icon: Sparkles },
  { href: '/compare', label: '深度对比工作台', icon: Scale },
  { href: '/me/favorites', label: '我的收藏', icon: Bookmark },
  { href: '/me/conversations', label: '会话历史', icon: MessageSquare },
];

export default function CommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden gap-2 text-muted-foreground sm:inline-flex"
      >
        <Search className="size-3.5" aria-hidden />
        <span className="hidden lg:inline">搜索仓库</span>
        <kbd className="ml-1 hidden border border-border bg-muted px-1 py-0.5 font-mono text-[9px] tracking-wider lg:inline">
          ⌘K
        </kbd>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="打开搜索"
        onClick={() => setOpen(true)}
        className="sm:hidden"
      >
        <Search className="size-4" aria-hidden />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogTitle className="sr-only">命令面板</DialogTitle>
          <Command shouldFilter={false} className="bg-card">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="搜索仓库或跳转页面…"
              className="font-mono text-[13px]"
            />
            <CommandList>
              <CommandEmpty>没有匹配项</CommandEmpty>
              {query.trim() ? (
                <CommandGroup heading="检索">
                  <CommandItem
                    value={`search-${query}`}
                    onSelect={() => go(`/repos?q=${encodeURIComponent(query.trim())}`)}
                  >
                    <Search aria-hidden />
                    在仓库中搜索 “{query.trim()}”
                    <CommandShortcut>↵</CommandShortcut>
                  </CommandItem>
                </CommandGroup>
              ) : null}
              <CommandSeparator />
              <CommandGroup heading="快速跳转">
                {QUICK_LINKS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
                      <Icon aria-hidden />
                      {item.label}
                      <SquareArrowOutUpRight className="ml-auto size-3 text-muted-foreground" aria-hidden />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
