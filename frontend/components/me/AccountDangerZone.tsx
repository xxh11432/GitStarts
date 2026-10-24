'use client';

import { useState } from 'react';
import { deleteAccount } from '@/lib/me';

export default function AccountDangerZone() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const remove = async () => {
    const confirmed = window.confirm(
      '删除账号会永久清除你的收藏、想法、对比、会话与画像，且无法恢复。确定继续吗？',
    );
    if (!confirmed) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await deleteAccount();
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
      setBusy(false);
    }
  };

  return (
    <section className="rounded-card border border-danger/30 bg-danger/5 p-5">
      <h2 className="text-sm font-semibold text-danger">删除账号</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
        将清理账号下的收藏、想法、对比记录、会话历史、画像与用量数据，操作不可恢复。
      </p>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="mt-3 rounded-md border border-danger px-3 py-1.5 text-xs text-danger transition-colors hover:bg-danger hover:text-white disabled:opacity-60"
      >
        {busy ? '清理中…' : '删除我的账号与数据'}
      </button>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </section>
  );
}
