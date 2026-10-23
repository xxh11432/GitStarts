import Link from 'next/link';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold text-gray-900">
          GitHub Stars
        </Link>
        <div className="flex gap-4 text-sm text-gray-600">
          <Link href="/repos" className="hover:text-gray-900">
            仓库列表
          </Link>
        </div>
      </nav>
    </header>
  );
}
