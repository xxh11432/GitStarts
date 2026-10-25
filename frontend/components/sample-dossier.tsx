import { Check, CircleHelp } from 'lucide-react';

import FitMeter from '@/components/fit-meter';
import VerdictStamp from '@/components/verdict-stamp';

export default function SampleDossier() {
  return (
    <section className="relative flex flex-col gap-4 rounded-xl border border-border bg-background p-5 shadow-hard">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Exhibit 01 · 示例档案
        </span>
        <span className="rounded-full border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          Sample
        </span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[13px] font-medium text-foreground">langgenius/dify</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            可自托管的知识库与 Agent 编排平台
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-4xl font-semibold leading-none text-primary">87</p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            Fit / 100
          </p>
        </div>
      </div>

      <FitMeter
        breakdown={{ semantic: 0.92, coverage: 0.83, maintenance: 0.88, license: 0.8 }}
      />

      <div className="flex flex-wrap gap-1.5">
        <Condition status="hit" label="Docker" />
        <Condition status="hit" label="MIT" />
        <Condition status="unknown" label="中文全文检索" />
      </div>

      <blockquote className="rounded-r-md border-l-2 border-highlight bg-highlight/10 px-3 py-2 text-xs leading-relaxed text-foreground">
        “Supports Docker Compose deployment and a built-in RAG pipeline for
        <span className="marker"> full-text retrieval</span>.”
      </blockquote>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          证据 3 · 来源 README
        </span>
        <VerdictStamp label="可进入对比" />
      </div>
    </section>
  );
}

function Condition({ status, label }: { status: 'hit' | 'unknown'; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {status === 'hit' ? (
        <Check className="size-3 text-primary" aria-hidden />
      ) : (
        <CircleHelp className="size-3 text-muted-foreground" aria-hidden />
      )}
      {label}
    </span>
  );
}
