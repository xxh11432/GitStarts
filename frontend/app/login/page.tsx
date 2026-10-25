import Link from 'next/link';
import { redirect } from 'next/navigation';

import LoginButton from '@/components/LoginButton';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
    <div className="mx-auto flex max-w-md flex-col gap-4 pt-8 sm:pt-16">
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-hard">
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Access / 登录
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            GitHub OAuth
          </span>
        </div>

        <div className="flex flex-col gap-5 p-6">
          <div>
            <h1 className="font-display text-title font-semibold text-foreground">登录 GitStars</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              浏览仓库无需登录。AI 匹配、对话与深度对比需要登录后使用，每个账号每天有固定额度。
            </p>
          </div>

          {failed ? (
            <Alert variant="destructive" className="rounded-lg border-destructive/40 bg-destructive/5 px-3 py-2">
              <AlertDescription className="text-xs">GitHub 登录未完成，请重试。</AlertDescription>
            </Alert>
          ) : null}

          <LoginButton next={next} className="w-full" />

          <p className="rounded-lg border border-border bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            每日额度按账号重置，登录后可在「我的」页面查看剩余次数。
          </p>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            登录即表示同意我们仅使用 GitHub 公开资料（昵称、头像、公开邮箱）创建账号。
            我们不存储 GitHub 密码，也不会读写你的仓库。
          </p>
        </div>
      </section>

      <Link
        href="/"
        className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary"
      >
        ← 返回首页
      </Link>
    </div>
  );
}
