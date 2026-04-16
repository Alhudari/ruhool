'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Home, Bot, FolderOpen, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';

const TABS = [
  { id: 'chat', icon: Home, label: { en: 'Chat', ar: 'محادثة' }, href: '/', match: (p: string) => p === '/' || p.startsWith('/chat') },
  { id: 'agents', icon: Bot, label: { en: 'Agents', ar: 'الوكلاء' }, href: '/agents', match: (p: string) => p.startsWith('/agents') },
  { id: 'files', icon: FolderOpen, label: { en: 'Files', ar: 'الملفات' }, href: '/files', match: (p: string) => p.startsWith('/files') || p.startsWith('/papers') },
  { id: 'settings', icon: Settings, label: { en: 'Settings', ar: 'الإعدادات' }, href: '/settings', match: (p: string) => p.startsWith('/settings') },
];

export function MobileTabBar() {
  const { language } = useAppStore();
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = TABS.find((t) => t.match(pathname))?.id ?? 'chat';

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-14">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => router.push(tab.href)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-all duration-200 ease-in-out min-w-[44px] relative',
                isActive
                  ? 'text-accent'
                  : 'text-on-surface-tertiary active:scale-95'
              )}
            >
              <div className={cn(
                'transition-transform duration-200 ease-in-out',
                isActive && 'scale-110'
              )}>
                <tab.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={cn(
                'text-[10px] leading-none transition-all duration-200',
                isActive ? 'font-semibold' : 'font-medium'
              )}>
                {tab.label[language]}
              </span>
              {isActive && (
                <span className="absolute top-0.5 inset-x-1/4 h-0.5 bg-accent rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
