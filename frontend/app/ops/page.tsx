import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import SectionHeading from '@/components/section-heading';
import { fetchMe, fetchOpsMetrics } from '@/lib/api';
import type { OpsBudgetAlert, OpsMetricsDay } from '@/lib/types';

export const dynamic = 'force-dynamic';

const ALERT_LABELS: Record<string, string> = {
  daily_tokens_exceeded: '日 token 超出预算',
  daily_compares_exceeded: '日对比次数超出预算',
  p95_chat_exceeded: '对话 P95 超出阈值',
  p95_match_exceeded: '匹配 P95 超出阈值',
  p95_compare_exceeded: '对比 P95 超出阈值',
};

function formatNumber(value: number): string {
  return value.toLocaleString('zh-CN');
}

function formatLatency(value?: number): string {
  return value === undefined ? '—' : `${(value / 1000).toFixed(1)}s`;
}

function formatAlert(alert: OpsBudgetAlert): string {
  return `${ALERT_LABELS[alert.code] ?? alert.code}：${alert.day} 实际 ${formatNumber(alert.value)}，阈值 ${formatNumber(alert.threshold)}`;
}

function DayRow({ row }: { row: OpsMetricsDay }) {
  return (
    <tr className="border-t border-border/70">
      <th scope="row" className="py-2 pr-4 text-left font-mono text-xs font-normal text-muted-foreground">
        {row.day}
      </th>
      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.requests)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.chatCount)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.matchCount)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.compareCount)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.tokensIn + row.tokensOut)}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {formatLatency(row.p95ByKind.chat)} / {formatLatency(row.p95ByKind.match)} /{' '}
        {formatLatency(row.p95ByKind.compare)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.errors)}</td>
    </tr>
  );
}

export default async function OpsPage() {
  const me = await fetchMe();
  if (!me) {
    redirect('/login?next=/ops');
  }

  const metrics = await fetchOpsMetrics(7);
  if (!metrics) {
    return (
      <div className="container max-w-3xl py-16">
        <SectionHeading index="OPS" title="成本看板" />
        <p className="mt-6 text-sm text-muted-foreground">
          仅运维账号可访问；当前账号（{me.nickname ?? `#${me.id}`}）不在 OPS_GITHUB_LOGINS 白名单内。
        </p>
        <Link href="/me" className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeft aria-hidden="true" className="size-4" />
          返回个人中心
        </Link>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-16">
      <SectionHeading index="OPS" title="成本看板" />
      <p className="mt-3 text-sm text-muted-foreground">
        统计窗口 {metrics.from} 至 {metrics.to}，数据来自 ai_metrics。
      </p>

      {metrics.alerts.length > 0 ? (
        <section
          aria-labelledby="ops-alerts-title"
          className="mt-8 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
        >
          <h2 id="ops-alerts-title" className="text-sm font-medium text-destructive">
            预算告警（{metrics.alerts.length}）
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-foreground">
            {metrics.alerts.map((alert) => (
              <li key={`${alert.code}-${alert.day}`}>{formatAlert(alert)}</li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="mt-8 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          当前窗口内无预算告警。预算：日 token {formatNumber(metrics.budgets.dailyTokens)}、日对比{' '}
          {formatNumber(metrics.budgets.dailyCompares)} 次、P95（对话 / 匹配 / 对比）{' '}
          {formatLatency(metrics.budgets.p95ChatMs)} / {formatLatency(metrics.budgets.p95MatchMs)} /{' '}
          {formatLatency(metrics.budgets.p95CompareMs)}。
        </p>
      )}

      <section aria-labelledby="ops-totals-title" className="mt-8">
        <h2 id="ops-totals-title" className="text-sm font-medium">
          窗口汇总
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <dt className="text-xs text-muted-foreground">请求总数</dt>
            <dd className="mt-1 text-2xl font-medium tabular-nums">{formatNumber(metrics.totals.requests)}</dd>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <dt className="text-xs text-muted-foreground">对比次数</dt>
            <dd className="mt-1 text-2xl font-medium tabular-nums">{formatNumber(metrics.totals.compareCount)}</dd>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <dt className="text-xs text-muted-foreground">Token 总量</dt>
            <dd className="mt-1 text-2xl font-medium tabular-nums">
              {formatNumber(metrics.totals.tokensIn + metrics.totals.tokensOut)}
            </dd>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <dt className="text-xs text-muted-foreground">P95 延迟（全部）</dt>
            <dd className="mt-1 text-2xl font-medium tabular-nums">{formatLatency(metrics.totals.p95Ms)}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="ops-daily-title" className="mt-10">
        <h2 id="ops-daily-title" className="text-sm font-medium">
          按天明细
        </h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[980px] text-sm">
            <caption className="sr-only">最近 7 天的 AI 请求、token、P95 延迟与错误数</caption>
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th scope="col" className="py-3 pl-4 pr-4 text-left font-medium">日期</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">请求</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">对话</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">匹配</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">对比</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Token</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">P95（对话/匹配/对比）</th>
                <th scope="col" className="px-3 py-3 pr-4 text-right font-medium">错误</th>
              </tr>
            </thead>
            <tbody>
              {metrics.days.map((row) => (
                <DayRow key={row.day} row={row} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          P95 取请求级延迟的最近秩；断流请求记入 cancelled，不重复计费。
        </p>
      </section>

      <Link href="/me" className="mt-10 inline-flex items-center gap-2 text-sm text-primary hover:underline">
        <ArrowLeft aria-hidden="true" className="size-4" />
        返回个人中心
      </Link>
    </div>
  );
}
