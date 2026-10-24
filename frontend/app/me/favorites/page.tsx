import Link from 'next/link';
import { redirect } from 'next/navigation';

import FavoritesManager from '@/components/me/FavoritesManager';
import PageHeader from '@/components/page-header';
import Pagination from '@/components/me/Pagination';
import { Button } from '@/components/ui/button';
import { fetchMe, fetchMyFavorites } from '@/lib/api';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const me = await fetchMe();
  if (!me) {
    redirect('/login?next=/me/favorites');
  }
  const currentPage = Math.max(Number(searchParams.page) || 1, 1);
  const data = await fetchMyFavorites(currentPage, PAGE_SIZE);
  const totalPages = Math.max(Math.ceil((data?.total ?? 0) / PAGE_SIZE), 1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        index="05"
        eyebrow="My favorites"
        title="收藏与备注"
        description="收藏保存在账号下，换设备或重新登录后仍然可见。"
        actions={
          <Button asChild variant="ghost" size="sm" className="rounded-none">
            <Link href="/me">返回个人中心</Link>
          </Button>
        }
      />
      <FavoritesManager key={currentPage} initialItems={data?.items ?? []} total={data?.total ?? 0} />
      <Pagination page={currentPage} totalPages={totalPages} base="/me/favorites" />
    </div>
  );
}
