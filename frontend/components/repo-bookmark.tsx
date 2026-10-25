'use client';

import { useState } from 'react';
import { Bookmark } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { redirectToLogin } from '@/lib/client';
import { addFavorite, removeFavorite } from '@/lib/me';

/** 卡片右下角的收藏按钮：只显示图标，初始状态由服务端批量读取。 */
export default function RepoBookmarkButton({
  fullName,
  authenticated,
  initialFavorited = false,
  initialId,
}: {
  fullName: string;
  authenticated: boolean;
  initialFavorited?: boolean;
  initialId?: number;
}) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [favoriteId, setFavoriteId] = useState<number | undefined>(initialId);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (!authenticated) {
      redirectToLogin(window.location.pathname);
      return;
    }
    setBusy(true);
    try {
      if (favorited && favoriteId) {
        await removeFavorite(favoriteId);
        setFavorited(false);
        setFavoriteId(undefined);
      } else {
        const created = await addFavorite(fullName);
        setFavorited(true);
        setFavoriteId(created.id);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : '收藏操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      disabled={busy}
      aria-label={favorited ? `取消收藏 ${fullName}` : `收藏 ${fullName}`}
      aria-pressed={favorited}
      className="size-7 rounded-lg text-muted-foreground hover:text-primary"
    >
      <Bookmark className={cn('size-3.5', favorited && 'fill-current text-primary')} aria-hidden />
    </Button>
  );
}
