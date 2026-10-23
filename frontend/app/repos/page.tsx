import Link from 'next/link';
import FilterBar from '@/components/FilterBar';
import RepoCard from '@/components/RepoCard';
import { fetchMeta, fetchRepos } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

export default async function ReposPage({ searchParams }: PageProps) {
  const sp = searchParams ?? {};
  const q = typeof sp.q === 'string' ? sp.q : undefined;
  const category = typeof sp.category === 'string' ? sp.category : undefined;
  const language = typeof sp.language === 'string' ? sp.language : undefined;
  const topic = typeof sp.topic === 'string' ? sp.topic : undefined;
  const sort = typeof sp.sort === 'string' ? sp.sort : undefined;
  const order = typeof sp.order === 'string' ? sp.order : undefined;

  const rawPage = typeof sp.page === 'string' ? parseInt(sp.page, 10) : 1;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const size = 20;

  const [result, meta] = await Promise.all([
    fetchRepos({ q, category, language, topic, sort, order, page, size }),
    fetchMeta(),
  ]);

  const nextParams = new URLSearchParams();
  if (q) nextParams.set('q', q);
  if (category) nextParams.set('category', category);
  if (language) nextParams.set('language', language);
  if (topic) nextParams.set('topic', topic);
  if (sort) nextParams.set('sort', sort);
  if (order) nextParams.set('order', order);
  nextParams.set('page', String(page + 1));
  const nextHref = `/repos?${nextParams.toString()}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">仓库列表</h1>
        <p className="text-sm text-gray-600">共 {result.total} 个仓库</p>
      </div>

      <FilterBar meta={meta} current={{ q, category, language }} />

      {result.items.length === 0 ? (
        <p className="text-gray-500">暂无数据</p>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {result.items.map((repo) => (
            <RepoCard key={repo.id} repo={repo} />
          ))}
        </div>
      )}

      {result.total > page * size && (
        <div className="flex justify-center">
          <Link
            href={nextHref}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:border-blue-300"
          >
            下一页
          </Link>
        </div>
      )}
    </div>
  );
}
