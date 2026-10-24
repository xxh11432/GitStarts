'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteConversation } from '@/lib/me';

export default function ConversationDeleteButton({ conversationId }: { conversationId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const remove = async () => {
    if (!window.confirm('删除后这条会话与消息无法恢复，确定删除吗？')) {
      return;
    }
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
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="rounded-md border border-line px-3 py-1 text-xs text-danger hover:border-danger disabled:opacity-60"
      >
        {busy ? '删除中…' : '删除会话'}
      </button>
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </div>
  );
}
