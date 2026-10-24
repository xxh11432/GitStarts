import Link from 'next/link';
import { redirect } from 'next/navigation';
import FavoritesManager from '@/components/me/FavoritesManager';
import { fetchMe, fetchMyFavorites } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function FavoritesPage() {
  const me = await fetchMe();
  if (!me) {
    redirect('/login?next=/me/favorites');
  }
  const page = await fetchMyFavorites(1, 50);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-accent">我的收藏</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">收藏与备注</h1>
          <p className="mt-2 text-sm text-ink-secondary">收藏保存在账号下，换设备或重新登录后仍然可见。</p>
        </div>
        <Link href="/me" className="text-xs text-accent hover:underline">
          返回个人中心
        </Link>
      </div>
      <FavoritesManager initialItems={page?.items ?? []} total={page?.total ?? 0} />
    </div>
  );
}
