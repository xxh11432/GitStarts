'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import EmptyState from '@/components/empty-state';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { removeFavorite, updateFavoriteNote } from '@/lib/me';
import type { FavoriteView } from '@/lib/types';

export default function FavoritesManager({
  initialItems,
  total,
}: {
  initialItems: FavoriteView[];
  total: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [totalCount, setTotalCount] = useState(total);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [pendingRemove, setPendingRemove] = useState<FavoriteView | null>(null);

  const startEdit = (item: FavoriteView) => {
    setEditingId(item.id);
    setDraft(item.note ?? '');
  };

  const saveNote = async (id: number) => {
    setBusyId(id);
    setError('');
    try {
      const updated = await updateFavoriteNote(id, draft);
      setItems((current) => current.map((item) => (item.id === id ? updated : item)));
      setEditingId(null);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '备注保存失败');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: number) => {
    setBusyId(id);
    setError('');
    try {
      await removeFavorite(id);
      setItems((current) => current.filter((item) => item.id !== id));
      setTotalCount((current) => Math.max(0, current - 1));
      setPendingRemove(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消收藏失败');
    } finally {
      setBusyId(null);
    }
  };

  if (items.length === 0) {
    return (
      <EmptyState
        title="还没有收藏"
        description="去仓库详情页点击「收藏」，备注与分类会一起沉淀到这里。"
        action={
          <Button asChild variant="outline" size="sm" className="rounded-lg">
            <Link href="/repos">浏览仓库</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        共 {totalCount} 个收藏
        {items.length < totalCount ? ` · 当前展示 ${items.length} 个` : ''}
      </p>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}

      {items.map((item, index) => (
        <article key={item.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <Link
                  href={`/repos/${item.repo.fullName}`}
                  className="font-mono text-[12px] font-medium text-foreground decoration-primary decoration-2 underline-offset-4 hover:underline"
                >
                  {item.repo.fullName}
                </Link>
              </div>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {[item.repo.language, item.repo.category].filter(Boolean).join(' · ') || '未分类'}
                {' · '}★ {item.repo.stars.toLocaleString('en-US')}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => startEdit(item)}
                className="rounded-lg"
              >
                <Pencil className="size-3" data-icon="inline-start" />
                备注
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setPendingRemove(item)}
                disabled={busyId === item.id}
                className="rounded-lg"
              >
                <Trash2 className="size-3" data-icon="inline-start" />
                {busyId === item.id ? '处理中…' : '取消收藏'}
              </Button>
            </div>
          </div>

          <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
            {item.repo.description ?? '暂无简介'}
          </p>

          {editingId === item.id ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={500}
                placeholder="为什么收藏它？"
                className="h-8 min-w-[200px] flex-1 rounded-lg text-xs"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => void saveNote(item.id)}
                disabled={busyId === item.id}
                className="rounded-lg"
              >
                保存
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingId(null)}
                className="rounded-lg"
              >
                取消
              </Button>
            </div>
          ) : item.note ? (
            <p className="mt-2 rounded-r-md border-l-2 border-highlight bg-highlight/10 px-2 py-1 text-[11px] text-foreground">
              备注：{item.note}
            </p>
          ) : null}
        </article>
      ))}

      <AlertDialog open={Boolean(pendingRemove)} onOpenChange={(open) => !open && setPendingRemove(null)}>
        <AlertDialogContent className="rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">取消收藏这个仓库？</AlertDialogTitle>
            <AlertDialogDescription className="text-[12px] leading-relaxed">
              {pendingRemove
                ? `将从收藏中移除 ${pendingRemove.repo.fullName}，备注也会一起删除。`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">保留</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRemove) {
                  void remove(pendingRemove.id);
                }
              }}
              className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
