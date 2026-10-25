'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { saveProfile } from '@/lib/me';
import type { Profile } from '@/lib/types';

function TagField({
  id,
  label,
  hint,
  placeholder,
  values,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const additions = draft
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (additions.length > 0) {
      const merged = Array.from(new Set([...values, ...additions])).slice(0, 20);
      onChange(merged);
    }
    setDraft('');
  };

  const remove = (value: string) => {
    onChange(values.filter((item) => item !== value));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="text-[13px] font-medium text-foreground">
          {label}
        </Label>
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
          {hint}
        </span>
      </div>
      <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5 focus-within:border-primary">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-1.5 py-0.5 font-mono text-[10px] text-primary"
          >
            {value}
            <button
              type="button"
              onClick={() => remove(value)}
              aria-label={`移除 ${value}`}
              className="text-primary/70 hover:text-primary"
            >
              <X className="size-2.5" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
              event.preventDefault();
              commit();
            } else if (event.key === 'Backspace' && !draft && values.length > 0) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={commit}
          placeholder={placeholder}
          aria-label={label}
          className="min-w-[100px] flex-1 bg-transparent px-1 py-0.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}

export default function ProfileEditor({ initial }: { initial: Profile }) {
  const router = useRouter();
  const [skills, setSkills] = useState(initial.skills);
  const [interests, setInterests] = useState(initial.interests);
  const [preferences, setPreferences] = useState(initial.preferences);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await saveProfile({ skills, interests, preferences });
      setMessage('画像已保存，推荐位已刷新');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div>
          <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground">
            Profile / 技能与偏好
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            用于个性化推荐位，仅自己可见；输入后按回车或逗号添加。
          </p>
        </div>
        <Button type="button" size="sm" onClick={submit} disabled={busy} className="rounded-lg">
          {busy ? '保存中…' : '保存画像'}
        </Button>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-3">
        <TagField
          id="profile-skills"
          label="技能"
          hint="Java / TypeScript"
          placeholder="添加技能"
          values={skills}
          onChange={setSkills}
        />
        <TagField
          id="profile-interests"
          label="兴趣"
          hint="知识库 / Agent"
          placeholder="添加兴趣"
          values={interests}
          onChange={setInterests}
        />
        <TagField
          id="profile-preferences"
          label="偏好"
          hint="中文文档 / 轻量部署"
          placeholder="添加偏好"
          values={preferences}
          onChange={setPreferences}
        />
      </div>
      {message ? <p className="px-4 pb-3 text-[11px] text-primary">{message}</p> : null}
      {error ? <p className="px-4 pb-3 text-[11px] text-destructive">{error}</p> : null}
      {initial.updatedAt ? (
        <p className="border-t border-border px-4 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
          上次保存 {initial.updatedAt.slice(0, 16).replace('T', ' ')}
        </p>
      ) : null}
    </section>
  );
}
