'use client';

import type { MatchCondition, Requirement } from '@/lib/match';

const KEY_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: 'platform', label: '平台', hint: 'windows / macos / linux / android / ios / harmony' },
  { value: 'language', label: '语言', hint: 'TypeScript / Python / Go' },
  { value: 'license', label: '许可证', hint: 'MIT / Apache-2.0 / GPL-3.0' },
  { value: 'category', label: '类目', hint: '站内类目名称' },
  { value: 'min_stars', label: '最低 star', hint: '例如 1000' },
  { value: 'active_within_days', label: '最近活跃', hint: '最近 N 天内有提交' },
  { value: 'self_hosted', label: '自托管', hint: 'true / docker' },
  { value: 'chinese_fulltext', label: '中文全文检索', hint: 'true' },
  { value: 'open_source', label: '开源', hint: 'true' },
];

function asInputValue(value: MatchCondition['value']): string {
  return Array.isArray(value) ? value.join(', ') : String(value);
}

function updateCondition(
  conditions: MatchCondition[],
  index: number,
  patch: Partial<MatchCondition>,
): MatchCondition[] {
  return conditions.map((condition, current) =>
    current === index ? { ...condition, ...patch } : condition,
  );
}

interface Props {
  requirement: Requirement;
  onChange: (requirement: Requirement) => void;
  onApply: () => void;
  disabled?: boolean;
}

export default function ConditionEditor({ requirement, onChange, onApply, disabled }: Props) {
  const setConditions = (field: 'must' | 'should', conditions: MatchCondition[]) => {
    onChange({ ...requirement, [field]: conditions });
  };

  const renderConditions = (field: 'must' | 'should', title: string, hint: string) => (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <p className="text-xs text-ink-muted">{hint}</p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setConditions(field, [...requirement[field], { key: 'platform', value: '' }])}
          className="rounded-md border border-line bg-background px-2.5 py-1 text-xs text-ink-secondary transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          添加
        </button>
      </div>
      {requirement[field].length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-3 py-3 text-xs text-ink-muted">
          暂无{title}
        </p>
      ) : (
        <ul className="space-y-2">
          {requirement[field].map((condition, index) => {
            const known = KEY_OPTIONS.some((option) => option.value === condition.key);
            return (
              <li key={`${field}-${index}`} className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`${title}条件 ${index + 1}`}
                  value={condition.key}
                  disabled={disabled}
                  onChange={(event) =>
                    setConditions(field, updateCondition(requirement[field], index, { key: event.target.value }))
                  }
                  className="rounded-md border border-line bg-background px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
                >
                  {!known && <option value={condition.key}>{condition.key}</option>}
                  {KEY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`${title}条件 ${index + 1} 的值`}
                  value={asInputValue(condition.value)}
                  disabled={disabled}
                  onChange={(event) =>
                    setConditions(
                      field,
                      updateCondition(requirement[field], index, { value: event.target.value }),
                    )
                  }
                  placeholder={KEY_OPTIONS.find((option) => option.value === condition.key)?.hint}
                  className="min-w-0 flex-1 rounded-md border border-line bg-background px-2 py-1.5 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    setConditions(
                      field,
                      requirement[field].filter((_, current) => current !== index),
                    )
                  }
                  className="rounded-md px-2 py-1 text-xs text-ink-muted transition-colors hover:text-danger disabled:opacity-50"
                >
                  删除
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <section className="rounded-card border border-line bg-background p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">结构化条件</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            AI 只抽取你明确说过的条件；这里可以修正或补充，再按新条件重新匹配。
          </p>
        </div>
        <button
          type="button"
          onClick={onApply}
          disabled={disabled}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          按这些条件匹配
        </button>
      </div>

      {requirement.degraded && (
        <p className="mb-4 rounded-card border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
          模型未能稳定抽取条件，以下内容按原文直接检索生成，请人工核对后再使用。
        </p>
      )}

      <label className="block">
        <span className="text-sm font-semibold text-ink">目标</span>
        <input
          value={requirement.goal}
          disabled={disabled}
          onChange={(event) => onChange({ ...requirement, goal: event.target.value })}
          className="mt-1 w-full rounded-md border border-line bg-background px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
        />
      </label>

      <div className="mt-4 grid gap-5 md:grid-cols-2">
        {renderConditions('must', '硬条件', '不满足会被扣掉条件覆盖分')}
        {renderConditions('should', '偏好条件', '用于重排时加分，不作硬性过滤')}
      </div>

      <label className="mt-4 block">
        <span className="text-sm font-semibold text-ink">排除关键词</span>
        <input
          value={requirement.exclude.join(', ')}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...requirement,
              exclude: event.target.value
                .split(/[,，]/)
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
          placeholder="多个关键词用逗号分隔"
          className="mt-1 w-full rounded-md border border-line bg-background px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
        />
      </label>
    </section>
  );
}
