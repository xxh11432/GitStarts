import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'GitStars · 用一句话找到能用的开源方案',
  description: '输入想法，匹配开源项目，AI 深读并横向对比，给每个结论附上证据。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background text-ink">
        <Navbar />
        <main className="mx-auto w-full max-w-container px-4 pb-16 pt-8 sm:px-6">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-container flex-col gap-2 px-4 py-8 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span>GitStars · 开源方案匹配与对比平台</span>
            <span>数据来自 GitHub 公开仓库 README 与元信息</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
