import Link from 'next/link';
import { redirect } from 'next/navigation';
import LoginButton from '@/components/LoginButton';
import { fetchMe } from '@/lib/api';
import { safeNext } from '@/lib/client';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const rawNext = searchParams?.next;
  const next = safeNext(typeof rawNext === 'string' ? rawNext : undefined);
  const failed = searchParams?.error === 'oauth';

  const me = await fetchMe();
  if (me) {
    redirect(next);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center pt-8 sm:pt-16">
      <div className="w-full rounded-card border border-line bg-background p-6 shadow-card sm:p-8">
        <h1 className="text-xl font-semibold text-ink">登录 GitStars</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          浏览仓库无需登录。AI 匹配、对话与深度对比需要登录后使用，每个账号每天有固定额度。
        </p>

        {failed && (
          <p className="mt-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            GitHub 登录未完成，请重试。
          </p>
        )}

        <div className="mt-6">
          <LoginButton next={next} />
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md bg-surface px-3 py-2">
            <dt className="text-xs text-ink-muted">每日 AI 对话</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-ink">30 次</dd>
          </div>
          <div className="rounded-md bg-surface px-3 py-2">
            <dt className="text-xs text-ink-muted">每日深度对比</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-ink">3 次</dd>
          </div>
        </dl>

        <p className="mt-6 text-xs leading-relaxed text-ink-muted">
          登录即表示同意我们仅使用 GitHub 公开资料（昵称、头像、公开邮箱）创建账号。
          我们不存储 GitHub 密码，也不会读写你的仓库。
        </p>
      </div>

      <Link href="/" className="mt-4 text-sm text-ink-secondary transition-colors hover:text-accent">
        ← 返回首页
      </Link>
    </div>
  );
}
