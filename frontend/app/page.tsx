import Link from 'next/link';
import RepoCard from '@/components/RepoCard';
import { fetchMeta, fetchRank } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [repos, meta] = await Promise.all([fetchRank('total', undefined, 10), fetchMeta()]);

  return (
    <div className="space-y-10">
      <section className="text-center">
        <h1 className="text-3xl font-bold">GitHub 热门仓库聚合</h1>
        <p className="mt-2 text-gray-600">发现最受欢迎的 GitHub 开源项目</p>
        <div className="mt-4">
          <Link
            href="/repos"
            className="inline-block rounded-md bg-blue-600 px-5 py-2 text-white hover:bg-blue-700"
          >
            浏览全部仓库
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">总榜 Top {repos.length}</h2>
          <Link href="/repos" className="text-sm text-blue-600 hover:underline">
            查看全部
          </Link>
        </div>
        {repos.length === 0 ? (
          <p className="text-gray-500">暂无数据，等待采集完成</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {repos.map((repo) => (
              <RepoCard key={repo.id} repo={repo} />
            ))}
          </div>
        )}
      </section>

      {meta.languages.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-semibold">热门语言</h2>
          <div className="flex flex-wrap gap-2">
            {meta.languages.slice(0, 12).map((lang) => (
              <Link
                key={lang.slug}
                href={`/repos?language=${lang.slug}`}
                className="rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:border-blue-300"
              >
                {lang.name}
                <span className="ml-1 text-gray-400">{lang.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
