'use client';

import Link from 'next/link';
import { useState } from 'react';
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');

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
    if (!window.confirm('确定取消收藏这个仓库吗？')) {
      return;
    }
    setBusyId(id);
    setError('');
    try {
      await removeFavorite(id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消收藏失败');
    } finally {
      setBusyId(null);
    }
  };

  if (items.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-line bg-surface p-6 text-sm text-ink-muted">
        还没有收藏。去仓库详情页点击「收藏」即可沉淀到这里。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-muted">共 {total} 个收藏{items.length < total ? `，当前展示 ${items.length} 个` : ''}</p>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {items.map((item) => (
        <article key={item.id} className="rounded-card border border-line bg-background p-4 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/repos/${item.repo.fullName}`} className="text-sm font-medium text-accent hover:underline">
                {item.repo.fullName}
              </Link>
              <p className="mt-1 text-xs text-ink-muted">
                {[item.repo.language, item.repo.category].filter(Boolean).join(' · ') || '未分类'}
                {' · '}★ {item.repo.stars.toLocaleString('en-US')}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => startEdit(item)}
                className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-secondary hover:border-accent hover:text-accent"
              >
                备注
              </button>
              <button
                type="button"
                onClick={() => remove(item.id)}
                disabled={busyId === item.id}
                className="rounded-md border border-line px-2.5 py-1 text-xs text-danger hover:border-danger disabled:opacity-60"
              >
                {busyId === item.id ? '处理中…' : '取消收藏'}
              </button>
            </div>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-muted">
            {item.repo.description ?? '暂无简介'}
          </p>
          {editingId === item.id ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={500}
                placeholder="为什么收藏它？"
                className="min-w-[200px] flex-1 rounded-md border border-line bg-background px-2 py-1 text-xs text-ink outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => saveNote(item.id)}
                disabled={busyId === item.id}
                className="rounded-md bg-accent px-3 py-1 text-xs text-white disabled:opacity-60"
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="rounded-md border border-line px-3 py-1 text-xs text-ink-secondary"
              >
                取消
              </button>
            </div>
          ) : item.note ? (
            <p className="mt-2 rounded bg-surface px-2 py-1 text-xs text-ink-secondary">备注：{item.note}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
