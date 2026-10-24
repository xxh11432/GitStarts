'use client';

import Link from 'next/link';
import { useState } from 'react';
import { logout } from '@/lib/client';

interface UserMenuProps {
  nickname: string;
  avatarUrl?: string;
}

export default function UserMenu({ nickname, avatarUrl }: UserMenuProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setBusy(true);
    setError(null);
    try {
      await logout();
      window.location.href = '/';
    } catch {
      setError('退出失败，请重试');
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/me"
        className="flex max-w-[9rem] items-center gap-2 rounded-md px-1 py-1 text-sm text-ink-secondary transition-colors hover:text-ink"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-6 w-6 rounded-full border border-line" />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-xs text-ink-secondary">
            {nickname.slice(0, 1)}
          </span>
        )}
        <span className="truncate">{nickname}</span>
      </Link>
      <button
        type="button"
        onClick={handleLogout}
        disabled={busy}
        className="rounded-md border border-line px-2 py-1 text-xs text-ink-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-60"
      >
        {busy ? '退出中…' : '退出'}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
