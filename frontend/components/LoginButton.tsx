import { loginHref } from '@/lib/client';
import GithubMark from '@/components/github-mark';
import { Button } from '@/components/ui/button';

export default function LoginButton({
  next,
  compact = false,
  className,
}: {
  next?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Button
      asChild
      variant={compact ? 'outline' : 'default'}
      size={compact ? 'sm' : 'lg'}
      className={className}
    >
      <a href={loginHref(next)}>
        <GithubMark />
        {compact ? '登录' : '使用 GitHub 登录'}
      </a>
    </Button>
  );
}
