'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  language: string;
}

function timeAgo(iso: string, lang: 'en' | 'ar'): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return lang === 'ar' ? 'الآن' : 'just now';
  if (mins < 60) return lang === 'ar' ? `${mins} د` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return lang === 'ar' ? `${hrs} س` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return lang === 'ar' ? `${days} ي` : `${days}d ago`;
}

export function RecentConversationsWidget() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Conversation[]>('/api/conversations')
      .then((data) => setConversations(data.slice(0, 5)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="border border-border rounded-[var(--radius-lg)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare size={18} className="text-accent" />
        <h2 className="text-sm font-medium text-on-surface">
          {isRTL ? 'المحادثات الأخيرة' : 'Recent Conversations'}
        </h2>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-on-surface-tertiary py-4 justify-center">
          <Loader2 size={14} className="animate-spin" />
        </div>
      ) : conversations.length === 0 ? (
        <p className="text-sm text-on-surface-tertiary py-4 text-center">
          {isRTL ? 'لا توجد محادثات بعد' : 'No conversations yet'}
        </p>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className="flex items-center justify-between gap-2 py-1.5"
            >
              <p className="text-sm text-on-surface truncate flex-1">{conv.title}</p>
              <span className="text-xs text-on-surface-tertiary shrink-0">
                {timeAgo(conv.updatedAt, language)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
