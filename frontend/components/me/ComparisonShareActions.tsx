'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { shareComparison } from '@/lib/compare';
import { deleteComparison, revokeComparisonShare } from '@/lib/me';

export default function ComparisonShareActions({
  comparisonId,
  initialToken,
}: {
  comparisonId: number;
  initialToken?: string;
}) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const share = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const nextToken = await shareComparison(comparisonId);
      setToken(nextToken);
      setMessage('分享链接已生成');
    } catch (err) {
      setError(err instanceof Error ? err.message : '分享失败');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!window.confirm('撤销后旧链接会立即失效，确定继续吗？')) {
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await revokeComparisonShare(comparisonId);
      setToken('');
      setMessage('分享已撤销');
    } catch (err) {
      setError(err instanceof Error ? err.message : '撤销失败');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!token) {
      return;
    }
    const url = `${window.location.origin}/compare/s/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setMessage('链接已复制');
    } catch {
      setError('复制失败，请手动复制链接');
    }
  };

  const remove = async () => {
    if (!window.confirm('删除后这条对比记录无法恢复，确定删除吗？')) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await deleteComparison(comparisonId);
      router.push('/me/comparisons');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
      setBusy(false);
    }
  };

  return (
    <section className="rounded-card border border-line bg-background p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        {token ? (
          <>
            <input
              readOnly
              value={`/compare/s/${token}`}
              className="min-w-[220px] flex-1 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-secondary"
            />
            <button
              type="button"
              onClick={copy}
              className="rounded-md border border-line px-3 py-1 text-xs text-ink-secondary hover:border-accent hover:text-accent"
            >
              复制链接
            </button>
            <button
              type="button"
              onClick={revoke}
              disabled={busy}
              className="rounded-md border border-line px-3 py-1 text-xs text-danger hover:border-danger disabled:opacity-60"
            >
              撤销分享
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={share}
            disabled={busy}
            className="rounded-md bg-accent px-3 py-1 text-xs text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {busy ? '生成中…' : '生成只读分享链接'}
          </button>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="ml-auto rounded-md border border-line px-3 py-1 text-xs text-danger hover:border-danger disabled:opacity-60"
        >
          删除这条对比
        </button>
      </div>
      {message ? <p className="mt-2 text-xs text-accent">{message}</p> : null}
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      <p className="mt-2 text-[11px] text-ink-muted">
        分享页只展示对比结论，不包含你的账号信息与需求原文。
      </p>
    </section>
  );
}
