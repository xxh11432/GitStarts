'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Scale } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  BASKET_CHANGE_EVENT,
  compareHref,
  readBasket,
  toggleRepoInBasket,
} from '@/lib/compare-basket';

/**
 * 加入对比篮：只写入本地篮子，不跳转页面。
 * 这样用户可以在匹配结果里连续挑选多个候选，再统一去对比。
 */
export default function CompareAddButton({
  fullName,
  ideaId,
}: {
  fullName: string;
  ideaId?: number | null;
}) {
  const router = useRouter();
  const [inBasket, setInBasket] = useState(false);

  useEffect(() => {
    const sync = () => setInBasket(readBasket().includes(fullName));
    sync();
    window.addEventListener(BASKET_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(BASKET_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [fullName]);

  const onClick = () => {
    const added = toggleRepoInBasket(fullName);
    const repos = readBasket();
    if (!added) {
      toast(`${fullName} 已移出对比篮`);
      return;
    }
    toast(`已加入对比篮 ${repos.length}/4`, {
      action: {
        label: '去对比',
        onClick: () => router.push(compareHref(repos, ideaId)),
      },
    });
  };

  return (
    <Button
      type="button"
      variant={inBasket ? 'secondary' : 'outline'}
      size="sm"
      onClick={onClick}
      aria-pressed={inBasket}
      className="rounded-none"
    >
      {inBasket ? (
        <Check className="size-3.5" data-icon="inline-start" />
      ) : (
        <Scale className="size-3.5" data-icon="inline-start" />
      )}
      {inBasket ? '已在对比篮' : '加入对比'}
    </Button>
  );
}
