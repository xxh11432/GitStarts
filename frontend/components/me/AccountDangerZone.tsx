'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';

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
import { deleteAccount } from '@/lib/me';

export default function AccountDangerZone() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const remove = async () => {
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
    <section className="border border-destructive/40 bg-destructive/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-destructive">
            Danger zone / 删除账号
          </h2>
          <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-muted-foreground">
            将清理账号下的收藏、想法、对比记录、会话历史、画像与用量数据，操作不可恢复。
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive" size="sm" disabled={busy} className="rounded-none">
              <Trash2 className="size-3.5" data-icon="inline-start" />
              {busy ? '清理中…' : '删除我的账号与数据'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-none">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display">确认永久删除账号？</AlertDialogTitle>
              <AlertDialogDescription className="text-[12px] leading-relaxed">
                删除账号会永久清除你的收藏、想法、对比、会话与画像，且无法恢复。
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
      {error ? <p className="mt-3 text-[11px] text-destructive">{error}</p> : null}
    </section>
  );
}
