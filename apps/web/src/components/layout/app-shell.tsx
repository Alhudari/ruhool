'use client';

import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Sidebar } from './sidebar';
import { TaskSidebar } from './task-sidebar';
import { MobileTabBar } from './mobile-tab-bar';
import { TopToolbar } from './top-toolbar';
import { SplitPaneArea } from './split-pane';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { useAppStore } from '@/store/app';
import { cn } from '@/lib/utils';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { hydrate, hydrated, mobileSidebarOpen, setMobileSidebarOpen, language } = useAppStore();
  const isRTL = language === 'ar';

  // Embed mode: when this AppShell is rendered inside an iframe (split pane or
  // pop-out window with ?embed=1), skip the chrome (sidebar/toolbar/tasks) and
  // render only the page content. Avoids duplicate sidebars wasting space.
  const [embed, setEmbed] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setEmbed(params.has('embed') || window.self !== window.top);
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Don't render until hydrated to avoid language flash
  if (!hydrated) {
    return <div className="flex h-screen overflow-hidden" />;
  }

  // Embed mode — bare content, no chrome
  if (embed) {
    return (
      <div className="h-screen overflow-auto bg-surface">
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile overlay sidebar */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
          />
          {/* Sidebar panel */}
          <div className={cn(
            'relative z-10',
            isRTL ? 'mr-auto' : 'ml-0'
          )}>
            <Sidebar onMobileNavigate={() => setMobileSidebarOpen(false)} />
          </div>
          {/* Close button */}
          <button
            onClick={() => setMobileSidebarOpen(false)}
            aria-label={isRTL ? 'أغلق القائمة' : 'Close menu'}
            className={cn(
              'absolute top-3 z-20 p-2 rounded-full bg-surface text-on-surface-secondary hover:bg-surface-secondary transition-colors',
              isRTL ? 'left-3' : 'right-3'
            )}
          >
            <X size={20} />
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <div className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-border bg-sidebar shrink-0">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            aria-label={isRTL ? 'افتح القائمة' : 'Open menu'}
            className="p-2 -ml-2 rounded-[var(--radius)] text-on-surface-secondary hover:bg-sidebar-hover transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <Menu size={20} />
          </button>
          <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0">
            <img src="/logo.png" alt="Ruhool" className="w-full h-full object-contain" />
          </div>
          <span className="font-semibold text-on-surface">
            {isRTL ? 'رحول' : 'Ruhool'}
          </span>
          <div className={cn('ml-auto', isRTL && 'ml-0 mr-auto')}>
            <NotificationBell />
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <main id="main-content" className="flex-1 flex flex-col min-w-0 pb-20 md:pb-6" tabIndex={-1}>
            <TopToolbar />
            <SplitPaneArea>{children}</SplitPaneArea>
          </main>
          <TaskSidebar />
        </div>
        <MobileTabBar />
      </div>
    </div>
  );
}
