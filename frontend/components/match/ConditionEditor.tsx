'use client';

import { Plus, Trash2 } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setConditions(field, [...requirement[field], { key: 'platform', value: '' }])}
          className="rounded-none"
        >
          <Plus className="size-3.5" data-icon="inline-start" />
          添加
        </Button>
      </div>

      {requirement[field].length === 0 ? (
        <p className="border border-dashed border-border px-3 py-3 text-[11px] text-muted-foreground">
          暂无{title}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {requirement[field].map((condition, index) => {
            const known = KEY_OPTIONS.some((option) => option.value === condition.key);
            return (
              <li
                key={`${field}-${index}`}
                className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-center"
              >
                <Select
                  value={condition.key}
                  disabled={disabled}
                  onValueChange={(value) =>
                    setConditions(
                      field,
                      updateCondition(requirement[field], index, { key: value }),
                    )
                  }
                >
                  <SelectTrigger
                    aria-label={`${title}条件 ${index + 1}`}
                    className="h-9 rounded-none font-mono text-[11px]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {!known ? (
                      <SelectItem value={condition.key}>{condition.key}</SelectItem>
                    ) : null}
                    {KEY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
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
                  className="h-9 rounded-none font-mono text-[11px]"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`删除${title}条件 ${index + 1}`}
                  disabled={disabled}
                  onClick={() =>
                    setConditions(
                      field,
                      requirement[field].filter((_, current) => current !== index),
                    )
                  }
                  className="justify-self-start text-muted-foreground hover:text-destructive sm:justify-self-end"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <section className="border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-2.5">
        <div>
          <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground">
            Structured conditions / 结构化条件
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            AI 只抽取你明确说过的条件；这里可以修正或补充，再按新条件重新匹配。
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={onApply}
          disabled={disabled}
          className="rounded-none"
        >
          按这些条件匹配
        </Button>
      </div>

      <div className="flex flex-col gap-5 p-4">
        {requirement.degraded ? (
          <Alert className="rounded-none border-info/40 bg-info/5 px-3 py-2 text-info">
            <AlertDescription className="text-[11px] text-info">
              模型未能稳定抽取条件，以下内容按原文直接检索生成，请人工核对后再使用。
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="requirement-goal" className="text-sm font-semibold text-foreground">
            目标
          </Label>
          <Input
            id="requirement-goal"
            value={requirement.goal}
            disabled={disabled}
            onChange={(event) => onChange({ ...requirement, goal: event.target.value })}
            className="h-9 rounded-none"
          />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {renderConditions('must', '硬条件', '不满足会被扣掉条件覆盖分')}
          {renderConditions('should', '偏好条件', '用于重排时加分，不作硬性过滤')}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="requirement-exclude" className="text-sm font-semibold text-foreground">
            排除关键词
          </Label>
          <Input
            id="requirement-exclude"
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
            className="h-9 rounded-none"
          />
        </div>
      </div>
    </section>
  );
}
