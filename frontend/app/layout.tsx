import type { Metadata } from 'next';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'GitStars · 用一句话找到能用的开源方案',
  description: '输入想法，匹配开源项目，AI 深读并横向对比，给每个结论附上证据。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="font-sans" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{if(localStorage.getItem('gitstars-theme')==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();",
          }}
        />
      </head>
      <body className="flex min-h-screen flex-col bg-background text-foreground">
        <TooltipProvider delayDuration={200}>
          <Navbar />
          <main className="mx-auto w-full max-w-container flex-1 px-4 pb-20 pt-8 sm:px-6 lg:px-8">
            {children}
          </main>
          <footer className="border-t border-border">
            <div className="mx-auto flex max-w-container flex-col gap-2 px-4 py-8 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
              <span>GitStars · Open-source decision ledger</span>
              <span>Evidence from public README &amp; manifests</span>
            </div>
          </footer>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
