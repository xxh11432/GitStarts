'use client';

import { useState } from 'react';
import { Bookmark } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { redirectToLogin } from '@/lib/client';
import { addFavorite, removeFavorite } from '@/lib/me';

export default function FavoriteButton({
  fullName,
  authenticated,
  initialFavorited,
  initialId,
}: {
  fullName: string;
  authenticated: boolean;
  initialFavorited: boolean;
  initialId?: number;
}) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [favoriteId, setFavoriteId] = useState<number | undefined>(initialId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = async () => {
    if (!authenticated) {
      redirectToLogin(window.location.pathname);
      return;
    }
    setBusy(true);
    setError('');
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
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant={favorited ? 'secondary' : 'outline'}
        size="sm"
        onClick={toggle}
        disabled={busy}
        aria-pressed={favorited}
        className="rounded-lg"
      >
        <Bookmark
          className={cn('size-3.5', favorited && 'fill-current')}
          data-icon="inline-start"
        />
        {busy ? '处理中…' : favorited ? '已收藏' : '收藏'}
      </Button>
      {error ? <span className="max-w-[200px] text-[11px] text-destructive">{error}</span> : null}
    </div>
  );
}
