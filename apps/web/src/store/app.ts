import { create } from 'zustand';

interface AppState {
  sidebarOpen: boolean;
  mobileSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;

  language: 'en' | 'ar';
  setLanguage: (lang: 'en' | 'ar') => void;

  theme: string;
  themeVariant: 'light' | 'dark' | 'system';
  setTheme: (theme: string) => void;
  setThemeVariant: (variant: 'light' | 'dark' | 'system') => void;

  activeConversationId: string | null;
  setActiveConversation: (id: string | null) => void;
  isStreaming: boolean;
  setIsStreaming: (streaming: boolean) => void;

  hydrated: boolean;
  hydrate: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  mobileSidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),

  // Defaults — will be overridden by hydrate()
  language: 'en',
  setLanguage: (language) => {
    set({ language });
    if (typeof window !== 'undefined') {
      document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.lang = language;
      localStorage.setItem('ruhool-language', language);
    }
  },

  theme: 'claude-clean',
  themeVariant: 'dark',
  setTheme: (theme) => {
    set({ theme });
    if (typeof window !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('ruhool-theme', theme);
    }
  },
  setThemeVariant: (variant) => {
    set({ themeVariant: variant });
    if (typeof window !== 'undefined') {
      const isDark =
        variant === 'dark' ||
        (variant === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', isDark);
      localStorage.setItem('ruhool-variant', variant);
    }
  },

  activeConversationId: null,
  setActiveConversation: (id) => set({ activeConversationId: id }),
  isStreaming: false,
  setIsStreaming: (isStreaming) => set({ isStreaming }),

  hydrated: false,
  hydrate: () => {
    if (typeof window === 'undefined') return;
    const lang = (localStorage.getItem('ruhool-language') || 'en') as 'en' | 'ar';
    let theme = localStorage.getItem('ruhool-theme') || 'claude-clean';
    // TH-02 (AUDIT.md): migrate legacy theme id.
    if (theme === 'vintage-terminal') {
      theme = 'desert-caravan';
      localStorage.setItem('ruhool-theme', theme);
    }
    const variant = (localStorage.getItem('ruhool-variant') || 'dark') as 'light' | 'dark' | 'system';
    set({ language: lang, theme, themeVariant: variant, hydrated: true });
  },
}));
