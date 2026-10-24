'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Link2, Lock, RotateCcw, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const [deleteOpen, setDeleteOpen] = useState(false);

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
    <section className="border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground">
          Share &amp; manage / 分享与记录
        </h2>
        <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
          <Lock className="size-3" aria-hidden />
          只读 · 不含账号与需求原文
        </span>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {token ? (
            <>
              <Input
                readOnly
                value={`/compare/s/${token}`}
                className="h-8 min-w-[220px] flex-1 rounded-none font-mono text-[11px]"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => void copy()} className="rounded-none">
                <Copy className="size-3.5" data-icon="inline-start" />
                复制链接
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void revoke()}
                disabled={busy}
                className="rounded-none text-destructive hover:text-destructive"
              >
                <RotateCcw className="size-3.5" data-icon="inline-start" />
                撤销分享
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" onClick={() => void share()} disabled={busy} className="rounded-none">
              <Link2 className="size-3.5" data-icon="inline-start" />
              {busy ? '生成中…' : '生成只读分享链接'}
            </Button>
          )}

          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                className="ml-auto rounded-none"
              >
                <Trash2 className="size-3.5" data-icon="inline-start" />
                删除这条对比
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-none">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display">删除这条对比记录？</AlertDialogTitle>
                <AlertDialogDescription className="text-[12px] leading-relaxed">
                  删除后记录与分享链接都无法恢复。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-none">取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void remove()}
                  className="rounded-none bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  确认删除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {message ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-primary">{message}</p>
        ) : null}
        {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      </div>
    </section>
  );
}
