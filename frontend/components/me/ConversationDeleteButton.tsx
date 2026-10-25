'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { deleteConversation } from '@/lib/me';

export default function ConversationDeleteButton({ conversationId }: { conversationId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteConversation(conversationId);
      router.push('/me/conversations');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="destructive" size="sm" className="rounded-lg">
            <Trash2 className="size-3.5" data-icon="inline-start" />
            删除会话
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">删除这条会话？</AlertDialogTitle>
            <AlertDialogDescription className="text-[12px] leading-relaxed">
              删除后这条会话与全部消息无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void remove()}
              disabled={busy}
              className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error ? <span className="text-[10px] text-destructive">{error}</span> : null}
    </div>
  );
}
