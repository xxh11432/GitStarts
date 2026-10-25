import type { Metadata } from 'next';
import '@fontsource-variable/bricolage-grotesque/wght.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './globals.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import AppShell from '@/components/app-shell';
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
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:border focus:border-border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:text-foreground focus:shadow-lg"
          >
            跳到主要内容
          </a>
          <Navbar />
          <AppShell>{children}</AppShell>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
