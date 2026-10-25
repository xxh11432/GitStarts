'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ArrowUpRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/**
 * 首页入口：只负责收集问题并跳转到 01 AI 对话，不在首页展开回答。
 */
export default function ChatLauncher() {
  const router = useRouter();
  const [value, setValue] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = value.trim();
    if (!text) {
      return;
    }
    router.push(`/chat?q=${encodeURIComponent(text)}`);
  };

  return (
    <form
      onSubmit={submit}
      className="overflow-hidden rounded-xl border border-border bg-card shadow-hard transition-colors focus-within:border-primary/60"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <label
          htmlFor="ask-input"
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
        >
          Ask / 描述你的需求
        </label>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {value.length}/4000
        </span>
      </div>
      <Textarea
        id="ask-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        rows={3}
        maxLength={4000}
        placeholder="例如：帮我找一个可 Docker 自托管、MIT 协议的中文全文检索知识库"
        className="min-h-[96px] resize-none rounded-lg border-0 bg-transparent px-4 py-3 text-body text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          提交后进入 01 AI 对话，回答附带仓库证据，可继续追问。
        </p>
        <Button type="submit" size="sm" disabled={!value.trim()} className="shrink-0">
          开始对话
          <ArrowUpRight className="size-3.5" data-icon="inline-end" />
        </Button>
      </div>
    </form>
  );
}
