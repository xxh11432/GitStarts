'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveProfile } from '@/lib/me';
import type { Profile } from '@/lib/types';

function TagField({
  label,
  hint,
  placeholder,
  values,
  onChange,
}: {
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
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="text-xs text-ink-muted">{hint}</span>
      </div>
      <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-md border border-line bg-background px-2 py-1.5 focus-within:border-accent">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded bg-accent/10 px-2 py-0.5 text-xs text-accent"
          >
            {value}
            <button
              type="button"
              onClick={() => remove(value)}
              aria-label={`移除 ${value}`}
              className="text-accent/70 hover:text-accent"
            >
              ×
            </button>
          </span>
        ))}
        <input
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
          className="min-w-[120px] flex-1 bg-transparent px-1 py-0.5 text-sm text-ink outline-none placeholder:text-ink-muted"
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
    <section className="rounded-card border border-line bg-background p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-ink">技能与偏好</h2>
          <p className="mt-1 text-xs text-ink-muted">
            用于个性化推荐位，仅自己可见；输入后按回车或逗号添加。
          </p>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded-md bg-accent px-4 py-1.5 text-sm text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? '保存中…' : '保存画像'}
        </button>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <TagField
          label="技能"
          hint="如 Java、TypeScript"
          placeholder="添加技能"
          values={skills}
          onChange={setSkills}
        />
        <TagField
          label="兴趣"
          hint="如 知识库、Agent"
          placeholder="添加兴趣"
          values={interests}
          onChange={setInterests}
        />
        <TagField
          label="偏好"
          hint="如 中文文档、轻量部署"
          placeholder="添加偏好"
          values={preferences}
          onChange={setPreferences}
        />
      </div>
      {message ? <p className="mt-3 text-xs text-accent">{message}</p> : null}
      {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
      {initial.updatedAt ? (
        <p className="mt-2 text-xs text-ink-muted">
          上次保存：{initial.updatedAt.slice(0, 16).replace('T', ' ')}
        </p>
      ) : null}
    </section>
  );
}
