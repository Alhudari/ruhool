'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, Paperclip, Loader2, Bot, User, Mic, Square, Headphones, Plus, X, Copy, CornerUpLeft, Camera, Image as ImageIcon, RotateCcw } from 'lucide-react';
import { ScreenShareButton } from './screen-share';
import { VoiceMode } from './voice-mode';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiStream, apiFetch } from '@/lib/api';
import { ResultCard, isResearchResult } from './result-card';
import { TaskProgressCard } from './task-progress-card';
import { ChatGroupHeader } from './chat-group-header';
import { TypingIndicator } from './typing-indicator';
import { ArtifactPreview } from '@/components/workflow-runs/artifact-preview';
import type { WorkflowArtifact } from '@/hooks/use-workflow-sse';

interface AgentDisplayInfo {
  name: { en: string; ar: string };
  color: string;
  bgColor: string;
  initial: string;
}

const BUILTIN_AGENT_DISPLAY: Record<string, AgentDisplayInfo> = {
  manager: { name: { en: "Al-Ra'i", ar: 'الراعي' }, color: 'bg-amber-500/20 text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-500', initial: 'ر' },
  doctor: { name: { en: 'Al-Duktor', ar: 'الدكتور' }, color: 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-500', initial: 'د' },
  research: { name: { en: 'Al-Bahith', ar: 'الباحث' }, color: 'bg-purple-500/20 text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-500', initial: 'ب' },
  'reading-helper': { name: { en: 'Al-Mulakhkhis', ar: 'المُلخِّص' }, color: 'bg-blue-500/20 text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-500', initial: 'خ' },
  'writing-critic': { name: { en: 'Al-Naqid', ar: 'الناقد' }, color: 'bg-green-500/20 text-green-600 dark:text-green-400', bgColor: 'bg-green-500', initial: 'ن' },
  comparator: { name: { en: 'Al-Muqarin', ar: 'المُقارِن' }, color: 'bg-red-500/20 text-red-600 dark:text-red-400', bgColor: 'bg-red-500', initial: 'ق' },
  architect: { name: { en: 'Al-Musammim', ar: 'المصمم' }, color: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-500', initial: 'م' },
  'content-creator': { name: { en: 'Al-Sarid', ar: 'السارد' }, color: 'bg-pink-500/20 text-pink-600 dark:text-pink-400', bgColor: 'bg-pink-500', initial: 'س' },
  creative: { name: { en: "Al-Mubdi'", ar: 'المبدع' }, color: 'bg-rose-500/20 text-rose-600 dark:text-rose-400', bgColor: 'bg-rose-500', initial: 'ب' },
  'tasks-agent': { name: { en: 'Maham', ar: 'مهام' }, color: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500', initial: 'م' },
  analyst: { name: { en: 'Al-Muhallil', ar: 'المحلل' }, color: 'bg-teal-500/20 text-teal-600 dark:text-teal-400', bgColor: 'bg-teal-500', initial: 'ح' },
  munazzim: { name: { en: 'Al-Munazzim', ar: 'المنظّم' }, color: 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-500', initial: 'ن' },
  mushakhkhis: { name: { en: 'Al-Mushakhkhis', ar: 'المشخّص' }, color: 'bg-red-500/20 text-red-600 dark:text-red-400', bgColor: 'bg-red-500', initial: 'ش' },
  'research-companion': { name: { en: 'Al-Khuwy', ar: 'الخوي' }, color: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500', initial: 'خ' },
  fatin: { name: { en: 'Al-Fatin', ar: 'الفطين' }, color: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400', bgColor: 'bg-cyan-500', initial: 'ف' },
  playmaker: { name: { en: 'Al-Mumarrir', ar: 'المُمرر' }, color: 'bg-violet-500/20 text-violet-600 dark:text-violet-400', bgColor: 'bg-violet-500', initial: 'م' },
  mudawwin: { name: { en: 'Al-Mudawwin', ar: 'المُدوّن' }, color: 'bg-amber-500/20 text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-500', initial: 'د' },
  sayyaq: { name: { en: 'Al-Katib', ar: 'الكاتب' }, color: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400', bgColor: 'bg-cyan-500', initial: 'ك' },
  clippy: { name: { en: 'Clippy', ar: 'Clippy' }, color: 'bg-sky-500/20 text-sky-600 dark:text-sky-400', bgColor: 'bg-sky-500', initial: 'C' },
};

const ALL_BUILTIN_AGENTS = [
  { id: 'manager', name: { en: "Al-Ra'i", ar: 'الراعي' }, desc: { en: 'PhD workspace CEO', ar: 'مدير غرفة الدكتوراه' } },
  { id: 'doctor', name: { en: 'Al-Duktor', ar: 'الدكتور' }, desc: { en: 'Life workspace CEO', ar: 'مدير غرفة الحياة' } },
  { id: 'research', name: { en: 'Al-Bahith', ar: 'الباحث' }, desc: { en: 'Deep research', ar: 'بحث عميق' } },
  { id: 'reading-helper', name: { en: 'Al-Mulakhkhis', ar: 'المُلخِّص' }, desc: { en: 'Reading + summarization', ar: 'قراءة وتلخيص' } },
  { id: 'writing-critic', name: { en: 'Al-Naqid', ar: 'الناقد' }, desc: { en: 'Writing critic', ar: 'ناقد الكتابة' } },
  { id: 'comparator', name: { en: 'Al-Muqarin', ar: 'المُقارِن' }, desc: { en: 'Compare papers', ar: 'مقارنة الأوراق' } },
  { id: 'architect', name: { en: 'Al-Musammim', ar: 'المصمم' }, desc: { en: 'Agent architect', ar: 'مدير الوكلاء' } },
  { id: 'content-creator', name: { en: 'Al-Sarid', ar: 'السارد' }, desc: { en: 'Arabic content', ar: 'المحتوى العربي' } },
  { id: 'creative', name: { en: "Al-Mubdi'", ar: 'المبدع' }, desc: { en: 'Video creator', ar: 'صانع الفيديو' } },
  { id: 'tasks-agent', name: { en: 'Maham', ar: 'مهام' }, desc: { en: 'Task manager', ar: 'مدير المهام' } },
  { id: 'analyst', name: { en: 'Al-Muhallil', ar: 'المحلل' }, desc: { en: 'Cost analyst', ar: 'محلل التكاليف' } },
  { id: 'munazzim', name: { en: 'Al-Munazzim', ar: 'المنظّم' }, desc: { en: 'Conversations & projects', ar: 'المحادثات والمشاريع' } },
  { id: 'mushakhkhis', name: { en: 'Al-Mushakhkhis', ar: 'المشخّص' }, desc: { en: 'System diagnostics', ar: 'فحص النظام' } },
  { id: 'research-companion', name: { en: 'Al-Khuwy', ar: 'الخوي' }, desc: { en: 'PhD companion', ar: 'رفيق الدكتوراه' } },
  { id: 'fatin', name: { en: 'Al-Fatin', ar: 'الفطين' }, desc: { en: 'Vision agent', ar: 'وكيل الرؤية' } },
  { id: 'playmaker', name: { en: 'Al-Mumarrir', ar: 'المُمرر' }, desc: { en: 'Routing intelligence', ar: 'الذكاء التوجيهي' } },
  { id: 'mudawwin', name: { en: 'Al-Mudawwin', ar: 'المُدوّن' }, desc: { en: 'Meeting tracker', ar: 'متابع الاجتماعات' } },
  { id: 'sayyaq', name: { en: 'Al-Katib', ar: 'الكاتب' }, desc: { en: 'Writing assistant', ar: 'مساعد الكتابة' } },
  { id: 'clippy', name: { en: 'Clippy', ar: 'Clippy' }, desc: { en: 'Onboarding assistant', ar: 'مساعد الإعداد' } },
];

const COLOR_OPTIONS = [
  { color: 'bg-purple-500/20 text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-500' },
  { color: 'bg-blue-500/20 text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-500' },
  { color: 'bg-green-500/20 text-green-600 dark:text-green-400', bgColor: 'bg-green-500' },
  { color: 'bg-red-500/20 text-red-600 dark:text-red-400', bgColor: 'bg-red-500' },
  { color: 'bg-pink-500/20 text-pink-600 dark:text-pink-400', bgColor: 'bg-pink-500' },
  { color: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400', bgColor: 'bg-cyan-500' },
  { color: 'bg-orange-500/20 text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-500' },
];

const AVAILABLE_MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
] as const;

/** CHAT_V2 P1: bubble kind — 'handoff' renders subtler (dashed, gray); 'progress'
 *  renders with pulsing indicator; 'artifact' foregrounds the attachment. */
type MessageKind = 'text' | 'progress' | 'handoff' | 'artifact';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
  agentId?: string;
  agentDisplay?: { ar: string; en: string };
  kind?: MessageKind;
  replyToAgentId?: string;
  artifacts?: WorkflowArtifact[];
  streaming?: boolean;
  errored?: boolean;
  dispatchStep?: 'dept-selected' | 'worker' | 'synthesis' | 'final';
  dispatchId?: string;
}

/** CHAT_V2 Wave D client-side feature flag. Default ON — Wave B's backend is live,
 *  per-agent bubbles are the new source of truth.
 *  Force OFF via `localStorage.setItem('ruhool-features-chat-v2', '0')`
 *  or via URL query `?chat-v2=0` (handy for bug repro / screenshots). */
function isChatV2Enabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('chat-v2');
    if (q === '0') return false;
    if (q === '1') return true;
    return window.localStorage.getItem('ruhool-features-chat-v2') !== '0';
  } catch {
    return true;
  }
}

/** CHAT_V2 Wave D — WhatsApp-style relative timestamp. */
function formatRelativeTime(iso: string | undefined, isRTL: boolean): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const now = Date.now();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 45) return isRTL ? 'الآن' : 'now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return isRTL ? `قبل ${diffMin} د` : `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    return isRTL
      ? diffHr === 1
        ? 'قبل ساعة'
        : `قبل ${diffHr} س`
      : `${diffHr}h`;
  }
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (diffHr < 48) return isRTL ? `أمس ${hh}:${mm}` : `yesterday ${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

interface ChatViewProps {
  initialMessage?: string;
  conversationId?: string | null;
  agentId?: string;
  onConversationCreated?: (id: string) => void;
}

export function ChatView({ initialMessage, conversationId: propConvId, agentId, onConversationCreated }: ChatViewProps) {
  const { language, isStreaming, setIsStreaming } = useAppStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [convId, setConvId] = useState(propConvId || null);
  const [activeAgentId, setActiveAgentId] = useState<string>(agentId || 'manager');
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingAgentId, setStreamingAgentId] = useState<string>('manager');
  const [activeTasks, setActiveTasks] = useState<Map<string, string>>(new Map());
  // CHAT_V2 Wave D: per-agent "typing…" indicator list. Populated on message.start,
  // drained on message.done/error.
  const [activeStreamingAgents, setActiveStreamingAgents] = useState<string[]>([]);
  // For sequential multi-mention follow-up
  const nextAgentToTriggerRef = useRef<string | null>(null);
  // Targeted agents for next message (multi-select via participant chips)
  const [targetedAgents, setTargetedAgents] = useState<Set<string>>(new Set());
  // Chain context: when an agent @mentions another, track depth + reason
  const chainContextRef = useRef<{ depth: number; reason: string; calledBy: string; replyToMessageId?: string } | null>(null);
  // Reply-to state: when set, next message is scoped to that specific message
  const [replyingTo, setReplyingTo] = useState<{ id: string; authorName: string; authorAgentId?: string; preview: string } | null>(null);
  // Ref mirror of isStreaming so chain follow-ups see the real-time value and aren't
  // blocked by a stale closure (common React pitfall with setTimeout-based chains).
  const isStreamingRef = useRef(false);
  useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);
  // Pending images attached to the next message (for Al-Fatin vision)
  const [pendingImages, setPendingImages] = useState<Array<{ id: string; base64: string; mimeType: string; previewUrl: string; name: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Clear stale state only when the USER actually switches to a DIFFERENT existing
  // conversation. Ignore: (a) initial mount, (b) null → UUID transition caused by
  // our own first outgoing message (onConversationCreated echoed back from parent).
  const lastSeenPropConvIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const prev = lastSeenPropConvIdRef.current;
    lastSeenPropConvIdRef.current = propConvId ?? null;
    // First render — nothing to clear
    if (prev === undefined) return;
    // Null → UUID is our own first-send echo — don't cancel our stream
    if (prev === null && propConvId) return;
    // UUID → same UUID shouldn't happen, but be safe
    if (prev === propConvId) return;
    // Real switch (UUID → different UUID, or UUID → null)
    nextAgentToTriggerRef.current = null;
    setTargetedAgents(new Set());
    setReplyingTo(null);
    setNameSuggestions([]);
    setDismissedSuggestionIds(new Set());
    if (cancelRef.current) { cancelRef.current(); cancelRef.current = null; }
    setIsStreaming(false);
    setStreamingContent('');
  }, [propConvId]);

  // (م.ريم): Esc clears targeting
  useEffect(() => {
    if (targetedAgents.size === 0) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTargetedAgents(new Set()); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [targetedAgents.size]);
  // Disambiguation popup: shows when user types an agent's name without @
  const [nameSuggestions, setNameSuggestions] = useState<Array<{ name: string; id: string }>>([]);
  // Topic-based suggestions (when user mentions a TOPIC like "video" → suggest المبدع)
  const [topicSuggestions, setTopicSuggestions] = useState<Array<{ name: string; id: string; reason: string }>>([]);
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<Set<string>>(new Set());
  const nameDetectAbortRef = useRef<AbortController | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<Array<{ id: string; type: string; title: { ar: string; en: string }; description: string; payload?: Record<string, unknown> }>>([]);

  const resolveApproval = useCallback(async (id: string, action: 'approve' | 'reject') => {
    try {
      await apiFetch(`/api/approvals/${id}/${action}`, { method: 'POST' });
      setPendingApprovals((prev) => prev.filter((a) => a.id !== id));
    } catch { /* ignore */ }
  }, []);
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [agentDisplay, setAgentDisplay] = useState<Record<string, AgentDisplayInfo>>(BUILTIN_AGENT_DISPLAY);
  const [participants, setParticipants] = useState<string[]>(['manager']);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [activeParticipantMenu, setActiveParticipantMenu] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const addAgentRef = useRef<HTMLDivElement>(null);
  const mentionPopupRef = useRef<HTMLDivElement>(null);
  const isRTL = language === 'ar';

  // Fetch custom agents to merge into display map
  useEffect(() => {
    apiFetch<{ id: string; name: { en: string; ar: string }; color: string }[]>('/api/custom-agents')
      .then((customs) => {
        const merged = { ...BUILTIN_AGENT_DISPLAY };
        customs.forEach((ca, idx) => {
          const colorOpt = COLOR_OPTIONS[idx % COLOR_OPTIONS.length];
          const initial = ca.name.ar?.[0] || ca.name.en?.[0] || '?';
          merged['custom-' + ca.id] = { name: ca.name, color: colorOpt.color, bgColor: colorOpt.bgColor, initial };
          merged[ca.id] = { name: ca.name, color: colorOpt.color, bgColor: colorOpt.bgColor, initial };
        });
        setAgentDisplay(merged);
      })
      .catch(() => {});
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  // Load conversation messages and participants
  useEffect(() => {
    if (propConvId) {
      apiFetch<Message[]>(`/api/conversations/${propConvId}/messages`)
        .then((rows) =>
          setMessages(
            rows.map((m) => ({
              ...m,
              // Infer sensible defaults so legacy rows (no kind/agentDisplay) still render.
              kind: m.kind || 'text',
              agentId: m.agentId || (m.role === 'assistant' ? 'manager' : undefined),
            }))
          )
        )
        .catch(() => {});
      apiFetch<string[]>(`/api/conversations/${propConvId}/participants`)
        .then((p) => setParticipants(p && p.length > 0 ? p : ['manager']))
        .catch(() => {});
    }
  }, [propConvId]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (addAgentRef.current && !addAgentRef.current.contains(e.target as Node)) {
        setShowAddAgent(false);
      }
      if (mentionPopupRef.current && !mentionPopupRef.current.contains(e.target as Node)) {
        setShowMentionPopup(false);
      }
      setActiveParticipantMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Send initial message only once
  const initialSent = useRef(false);
  useEffect(() => {
    if (initialMessage && !initialSent.current) {
      initialSent.current = true;
      sendMessage(initialMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Add agent to conversation participants
  const addParticipant = useCallback(async (agentIdToAdd: string) => {
    if (participants.includes(agentIdToAdd)) return;
    setParticipants((prev) => [...prev, agentIdToAdd]);
    setShowAddAgent(false);

    // Show confirmation message in chat
    const info = agentDisplay[agentIdToAdd];
    const agentName = info?.name[language] || agentIdToAdd;
    const sysMsg: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: isRTL ? `✓ تمت إضافة ${agentName} إلى المحادثة` : `✓ Added ${agentName} to the conversation`,
      agentId: 'system',
    };
    setMessages((msgs) => [...msgs, sysMsg]);

    if (convId) {
      try {
        await apiFetch<string[]>(`/api/conversations/${convId}/participants`, {
          method: 'POST',
          body: JSON.stringify({ agentId: agentIdToAdd }),
        });
      } catch { /* best effort */ }
    }
  }, [participants, convId, agentDisplay, language, isRTL]);

  // Remove agent from conversation participants
  const removeParticipant = useCallback(async (agentIdToRemove: string) => {
    // Allow removing anyone — including manager — so user can have a focused chat.
    // Safety: never leave conversation empty; if this would remove the last participant, ignore.
    if (participants.length <= 1) return;
    setParticipants((prev) => prev.filter((p) => p !== agentIdToRemove));
    setActiveParticipantMenu(null);

    // Show confirmation message
    const info = agentDisplay[agentIdToRemove];
    const agentName = info?.name[language] || agentIdToRemove;
    const sysMsg: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: isRTL ? `✓ تم حذف ${agentName} من المحادثة` : `✓ Removed ${agentName} from the conversation`,
      agentId: 'system',
    };
    setMessages((msgs) => [...msgs, sysMsg]);

    if (convId) {
      try {
        await apiFetch<string[]>(`/api/conversations/${convId}/participants/${agentIdToRemove}`, {
          method: 'DELETE',
        });
      } catch { /* best effort */ }
    }
  }, [convId, agentDisplay, language, isRTL]);

  // Handle files from attach/camera → read as base64, add to pendingImages
  const handleImageFiles = useCallback(async (files: FileList | File[]) => {
    const arr: Array<{ id: string; base64: string; mimeType: string; previewUrl: string; name: string }> = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(f);
      });
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
      arr.push({ id: crypto.randomUUID(), base64, mimeType: f.type, previewUrl: dataUrl, name: f.name });
    }
    if (arr.length) setPendingImages((prev) => [...prev, ...arr]);
  }, []);

  // Insert @mention into input
  const insertMention = useCallback((mentionAgentId: string) => {
    const info = agentDisplay[mentionAgentId];
    if (!info) return;
    const mentionText = `@${info.name[language]}`;
    const before = input.slice(0, mentionStartIndex);
    const after = input.slice(inputRef.current?.selectionEnd || input.length);
    setInput(before + mentionText + ' ' + after);
    setShowMentionPopup(false);
    setMentionFilter('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [input, mentionStartIndex, language, agentDisplay]);

  // Detect agent names in input (debounced) — for disambiguation popup
  // (م.ليلى round 2): if input already has @, hide suggestions — user knows what they're doing
  useEffect(() => {
    if (!input.trim() || input.length < 3 || input.includes('@')) { setNameSuggestions([]); return; }
    if (nameDetectAbortRef.current) nameDetectAbortRef.current.abort();
    const controller = new AbortController();
    nameDetectAbortRef.current = controller;
    const handle = setTimeout(async () => {
      try {
        const r = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001'}/api/chat/detect-agent-names`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: input }), signal: controller.signal,
        });
        if (!r.ok) return;
        const data = await r.json() as { matches: Array<{ name: string; id: string }>; topicMatches?: Array<{ name: string; id: string; reason: string }> };
        // Don't suggest the active agent itself, or already in chat, or dismissed
        const filterFn = (m: { id: string; name: string }) =>
          m.id !== activeAgentId && !input.includes('@' + m.name)
          && !dismissedSuggestionIds.has(m.id) && !participants.includes(m.id);
        setNameSuggestions(data.matches.filter(filterFn));
        setTopicSuggestions((data.topicMatches || []).filter(filterFn));
      } catch { /* ignore */ }
    }, 250); // (م.ليلى): faster — was 500ms
    return () => clearTimeout(handle);
  }, [input, activeAgentId, dismissedSuggestionIds]);

  // Handle input change with @mention detection
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1 && (atIndex === 0 || value[atIndex - 1] === ' ' || value[atIndex - 1] === '\n')) {
      const filterText = textBeforeCursor.slice(atIndex + 1);
      if (!filterText.includes(' ')) {
        setShowMentionPopup(true);
        setMentionFilter(filterText.toLowerCase());
        setMentionStartIndex(atIndex);
        return;
      }
    }
    setShowMentionPopup(false);
  }, []);

  // Filter agents for mention popup
  const mentionAgents = useMemo(() => {
    return participants
      .map((pid) => {
        const info = agentDisplay[pid];
        if (!info) return null;
        return { id: pid, ...info };
      })
      .filter((a): a is NonNullable<typeof a> => {
        if (!a) return false;
        if (!mentionFilter) return true;
        return (
          a.name.en.toLowerCase().includes(mentionFilter) ||
          a.name.ar.includes(mentionFilter)
        );
      });
  }, [participants, mentionFilter, agentDisplay]);

  // Agents not yet in conversation (for add dropdown)
  const availableToAdd = useMemo(() => {
    return ALL_BUILTIN_AGENTS.filter((a) => !participants.includes(a.id));
  }, [participants]);

  const sendMessage = useCallback(
    (text: string, overrideAgentId?: string, chainDepth?: number, replyToOverride?: { id: string; authorAgentId?: string } | null) => {
      // Use the ref so chain follow-ups scheduled via setTimeout see the CURRENT state,
      // not the stale `isStreaming` closure value from when the callback was created.
      if (isStreamingRef.current) return;
      // Allow sending with only images (empty text), but not an empty-empty message
      if (!text.trim() && pendingImages.length === 0) return;

      // Reply-scoping: either a direct override (from auto-chain) or the UI state
      const activeReply = replyToOverride ?? replyingTo;

      // If user pre-selected target agents via chip menu, prepend their @mentions
      let finalText = text;
      if (targetedAgents.size > 0 && !overrideAgentId) {
        const mentions = Array.from(targetedAgents).map((aid) => {
          const info = agentDisplay[aid];
          return info ? `@${info.name[language]}` : '';
        }).filter(Boolean).join(' ');
        if (mentions && !text.includes('@')) finalText = `${mentions} ${text}`;
      }

      // If replying to a specific agent message and no @mention yet, auto-prepend it
      if (activeReply?.authorAgentId && !overrideAgentId && !finalText.includes('@')) {
        const info = agentDisplay[activeReply.authorAgentId];
        if (info) finalText = `@${info.name[language]} ${finalText}`;
      }

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: finalText,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setNameSuggestions([]);
      setDismissedSuggestionIds(new Set());
      setTargetedAgents(new Set());  // clear after send
      setReplyingTo(null);
      setPendingImages([]);
      setIsStreaming(true);
      setStreamingContent('');

      let collected = '';
      let responseAgentId = activeAgentId;
      // BUG-1 FIX: once v2 (message.start) is observed, ignore legacy `text`
      // events for rendering so we never produce duplicate bubbles.
      let sawV2 = false;

      const effectiveAgentId = overrideAgentId || agentId;
      const cancel = apiStream(
        '/api/chat',
        {
          conversationId: convId,
          message: finalText,
          ...(effectiveAgentId ? { agentId: effectiveAgentId } : {}),
          ...(chainDepth ? { chainDepth } : {}),
          ...(activeReply?.id ? { replyToMessageId: activeReply.id } : {}),
          ...(pendingImages.length > 0 ? { images: pendingImages.map((img) => ({ base64: img.base64, mimeType: img.mimeType })) } : {}),
        },
        (event, data: unknown) => {
          const d = data as Record<string, unknown>;
          if (event === 'conversation') {
            const newId = d.conversationId as string;
            setConvId(newId);
            onConversationCreated?.(newId);
            if (d.agentId) {
              setActiveAgentId(d.agentId as string);
              setStreamingAgentId(d.agentId as string);
              responseAgentId = d.agentId as string;
            }
            if (d.participants) {
              setParticipants(d.participants as string[]);
            }
          } else if (event === 'text') {
            // BUG-1 FIX: if v2 is active, legacy `text` would produce a second
            // duplicate bubble at stream close. Drop it.
            if (sawV2) return;
            const chunk = d.content as string;
            collected += chunk;
            setStreamingContent(collected);
          } else if (event === 'task') {
            const taskId = d.taskId as string;
            const msgId = crypto.randomUUID();
            setActiveTasks((prev) => new Map(prev).set(taskId, msgId));
          } else if (event === 'approval_request') {
            const list = (d.approvals as Array<{ id: string; type: string; title: { ar: string; en: string }; description: string; payload?: Record<string, unknown> }>) || [];
            setPendingApprovals((prev) => [...prev, ...list]);
          } else if (event === 'next_agent_queued') {
            nextAgentToTriggerRef.current = d.agentId as string;
            chainContextRef.current = {
              depth: (d.depth as number) || 1,
              reason: (d.reason as string) || 'multi-mention',
              calledBy: (d.calledBy as string) || '',
              replyToMessageId: (d.replyToMessageId as string) || undefined,
            };
          } else if (event === 'message.start' && isChatV2Enabled()) {
            // BUG-1 FIX: mark v2 active so we drop any subsequent legacy `text`
            // events (which would render a second, duplicate bubble).
            sawV2 = true;
            // Discard any legacy partial buffer so it does NOT get appended on done.
            collected = '';
            setStreamingContent('');
            // CHAT_V2 P1: a specialist is about to speak. Insert a placeholder bubble
            // now so the user sees a typing indicator per agent, in real time.
            const msgId = d.messageId as string;
            const ag = d.agentId as string;
            const kind = ((d.kind as string) || 'text') as MessageKind;
            const replyTo = d.replyToAgentId as string | undefined;
            const agentDisp = d.agentDisplay as { ar: string; en: string } | undefined;
            const createdAt = (d.createdAt as string) || new Date().toISOString();
            if (msgId && ag) {
              setMessages((prev) =>
                prev.some((m) => m.id === msgId)
                  ? prev
                  : [...prev, {
                      id: msgId, role: 'assistant', content: '', agentId: ag, kind,
                      replyToAgentId: replyTo, agentDisplay: agentDisp, createdAt,
                      streaming: true,
                    }]
              );
              setActiveStreamingAgents((prev) => prev.includes(ag) ? prev : [...prev, ag]);
              if (ag && !participants.includes(ag)) {
                setParticipants((prev) => (prev.includes(ag) ? prev : [...prev, ag]));
              }
            }
          } else if (event === 'message.delta' && isChatV2Enabled()) {
            const msgId = d.messageId as string;
            const chunk = (d.text as string) || '';
            if (msgId && chunk) {
              setMessages((prev) =>
                prev.map((m) => (m.id === msgId ? { ...m, content: m.content + chunk } : m))
              );
            }
          } else if (event === 'participants.update' && isChatV2Enabled()) {
            const ids = (d.participantAgentIds as string[]) || [];
            if (ids.length > 0) setParticipants(ids);
          } else if (event === 'message.done' && isChatV2Enabled()) {
            // CHAT_V2 P1: specialist finished. The server already persisted the row;
            // we refetch content lazily on reload. For the current session we leave
            // the placeholder in place — the `tool_result` event is also emitted with
            // the full output, so the bubble can be populated by a small sibling hook.
            const msgId = d.messageId as string;
            const artifacts = (d.artifacts as WorkflowArtifact[] | undefined) || undefined;
            if (msgId) {
              let doneAgentId: string | undefined;
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== msgId) return m;
                  doneAgentId = m.agentId;
                  return { ...m, streaming: false, ...(artifacts ? { artifacts } : {}) };
                })
              );
              if (doneAgentId) {
                setActiveStreamingAgents((prev) => prev.filter((a) => a !== doneAgentId));
              }
            }
          } else if (event === 'tool_result' && isChatV2Enabled()) {
            // Backfill the CHAT_V2 placeholder bubble with the specialist's output.
            const output = (d.output as string) || '';
            const spec = d.specialist as string | undefined;
            if (output && spec) {
              setMessages((prev) => {
                // Find the most recent placeholder for this specialist and fill it.
                for (let i = prev.length - 1; i >= 0; i--) {
                  if (prev[i].agentId === spec && prev[i].role === 'assistant' && prev[i].content === '') {
                    const next = [...prev];
                    next[i] = { ...next[i], content: output };
                    return next;
                  }
                }
                return prev;
              });
            }
          }
        },
        () => {
          // BUG-1 FIX: only synthesize a legacy assistant bubble if v2 never
          // emitted its own bubble for this stream. Previously both paths ran,
          // creating duplicate messages for every assistant reply.
          if (collected && !sawV2) {
            const assistantMsg: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: collected,
              agentId: responseAgentId,
            };
            setMessages((msgs) => [...msgs, assistantMsg]);
          }
          // Capture length BEFORE clearing — previous code cleared first then checked length,
          // which meant the follow-up never fired (silent "lag").
          const finalLen = collected.length;
          setStreamingContent('');
          setIsStreaming(false);
          setActiveStreamingAgents([]);
          setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
          collected = '';
          setTimeout(() => inputRef.current?.focus(), 50);
          // Auto-trigger next agent (multi-mention OR agent-to-agent)
          const next = nextAgentToTriggerRef.current;
          const ctx = chainContextRef.current;
          nextAgentToTriggerRef.current = null;
          chainContextRef.current = null;
          if (next && responseAgentId && finalLen > 20) {
            // Fire the follow-up directly — don't re-check isStreaming (the closure
            // captures stale state and would bail out incorrectly). sendMessage
            // guards against its own re-entry.
            const prevName = agentDisplay[responseAgentId]?.name[language] || responseAgentId;
            const isAgentCall = ctx?.reason === 'agent-call' || ctx?.reason === 'run-next';
            const followUp = isAgentCall
              ? (isRTL
                ? `(داخلي — سلسلة) راجع آخر ردّ من ${prevName} وقم بدورك. لو دورك انتهى استخدم [RUN:DONE]. لو تحتاج وكيل آخر [RUN:NEXT_AGENT:id]. لا تتقمص شخصية وكيل آخر.`
                : `(internal chain) Review ${prevName}'s last reply and do your part. Use [RUN:DONE] when your turn is complete, or [RUN:NEXT_AGENT:id] to hand off. Never impersonate another agent.`)
              : (isRTL
                ? `(تلقائي) دور ${agentDisplay[next]?.name[language] || next}: راجع آخر ردّ من ${prevName} وقم بدورك.`
                : `(auto) ${agentDisplay[next]?.name[language] || next}: review ${prevName}'s last reply and do your part.`);
            setTimeout(() => {
              sendMessage(followUp, next, ctx?.depth, ctx?.replyToMessageId ? { id: ctx.replyToMessageId, authorAgentId: responseAgentId } : null);
            }, 600);
          }
        },
        (error) => {
          const errorMsg: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Error: ${error}`,
            errored: true,
          };
          setMessages((prev) => [
            ...prev.map((m) => (m.streaming ? { ...m, streaming: false, errored: true } : m)),
            errorMsg,
          ]);
          setActiveStreamingAgents([]);
          setIsStreaming(false);
          setStreamingContent('');
          collected = '';
        }
      );

      cancelRef.current = cancel;
    },
    [convId, isStreaming, setIsStreaming, onConversationCreated, agentId, activeAgentId, replyingTo, targetedAgents, language, pendingImages]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const startRecording = useCallback(async () => {
    const SpeechRecognitionAPI =
      typeof window !== 'undefined'
        ? (window as unknown as Record<string, unknown>).SpeechRecognition ||
          (window as unknown as Record<string, unknown>).webkitSpeechRecognition
        : null;

    if (SpeechRecognitionAPI) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recognition = new (SpeechRecognitionAPI as any)();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language === 'ar' ? 'ar-KW' : 'en-US';

        let finalTranscript = '';

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' ';
            } else {
              interim += transcript;
            }
          }
          setLiveTranscript(finalTranscript + interim);
        };

        recognition.onerror = () => {};
        recognition.onend = () => {};

        recognition.start();
        recognitionRef.current = recognition;
        setIsRecording(true);
        setRecordingDuration(0);
        setLiveTranscript('');

        recordingTimerRef.current = setInterval(() => {
          setRecordingDuration((d) => d + 1);
        }, 1000);

        return;
      } catch {
        // Fall back to MediaRecorder
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingDuration(0);
      setLiveTranscript('');

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);

      mediaRecorder.start();
    } catch {
      // Microphone access denied
    }
  }, [language]);

  const stopRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;

      const transcript = liveTranscript.trim();
      setIsRecording(false);
      setRecordingDuration(0);

      if (transcript) {
        setInput(transcript);
        setLiveTranscript('');
        setTimeout(() => inputRef.current?.focus(), 100);
      } else {
        setLiveTranscript('');
      }
      return;
    }

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current = null;
    }
    const duration = recordingDuration;
    setIsRecording(false);
    setRecordingDuration(0);
    setLiveTranscript('');
    sendMessage(`[Voice note - ${duration} seconds]`);
  }, [recordingDuration, sendMessage, liveTranscript]);

  // Resolve per-message agent info
  const getMessageAgentInfo = useCallback((msg: Message) => {
    const msgAgentId = msg.agentId || activeAgentId;
    return agentDisplay[msgAgentId] || agentDisplay.manager || BUILTIN_AGENT_DISPLAY.manager;
  }, [activeAgentId, agentDisplay]);

  const proseClasses = 'text-sm text-on-surface leading-relaxed break-words prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-code:text-accent prose-code:bg-surface-secondary prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-surface-secondary prose-pre:rounded-lg prose-pre:p-3';

  // CHAT_V2 Wave D: evaluate once per render so the group-header / bubble
  // tweaks stay in sync with the stream handler's flag checks.
  const chatV2 = typeof window !== 'undefined' ? isChatV2Enabled() : true;
  const groupTitle = useMemo(() => {
    if (!isRTL) return participants.length <= 1 ? 'Chat' : `Ruhool group (${participants.length})`;
    return participants.length <= 1 ? 'محادثة' : `مجموعة رحول (${participants.length})`;
  }, [participants.length, isRTL]);

  return (
    <div className="flex flex-col h-full">
      {/* CHAT_V2 Wave D — WhatsApp-style group header (avatar stack + drawer) */}
      {chatV2 && (
        <ChatGroupHeader
          title={groupTitle}
          participantIds={participants}
          agentDisplay={agentDisplay}
          language={language}
          isRTL={isRTL}
          activeAgentIds={activeStreamingAgents}
        />
      )}

      {/* Agent Presence Bar */}
      <div className="border-b border-border px-4 py-2 shrink-0 relative" style={{ overflow: 'visible' }}>
        <div className="max-w-3xl mx-auto flex items-center gap-2 overflow-x-auto scrollbar-none" style={{ overflowY: 'visible' }}>
          {participants.map((pid) => {
            const info = agentDisplay[pid] || BUILTIN_AGENT_DISPLAY.manager;
            const isPrimary = pid === participants[0];
            return (
              <div key={pid} className="relative group shrink-0" data-participant-chip={pid}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveParticipantMenu(activeParticipantMenu === pid ? null : pid);
                  }}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded-full transition-all text-xs',
                    'hover:bg-surface-secondary',
                    isPrimary && 'ring-2 ring-accent/30',
                    targetedAgents.has(pid) && 'ring-2 ring-amber-500 bg-amber-500/10',
                    pid === streamingAgentId && isStreaming && 'ring-2 ring-accent animate-pulse'
                  )}
                  title={targetedAgents.has(pid) ? (isRTL ? 'مستهدف للرسالة التالية' : 'Targeted for next message') : info.name[language]}
                >
                  <span
                    className={cn(
                      'w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0 shadow-sm',
                      info.bgColor
                    )}
                  >
                    {info.initial}
                  </span>
                  <span className="hidden md:inline text-on-surface-secondary text-xs whitespace-nowrap">
                    {info.name[language]}
                  </span>
                </button>

                {/* Participant context menu — fixed position so it escapes the presence bar's overflow clipping */}
                {activeParticipantMenu === pid && (() => {
                  const chipEl = typeof document !== 'undefined' ? document.querySelector(`[data-participant-chip="${pid}"]`) as HTMLElement | null : null;
                  const rect = chipEl?.getBoundingClientRect();
                  return (
                  <div
                    className="fixed z-[100] bg-surface border border-border rounded-[var(--radius)] shadow-xl min-w-[200px]"
                    style={rect ? {
                      top: rect.bottom + 4,
                      [isRTL ? 'right' : 'left']: isRTL ? (window.innerWidth - rect.right) : rect.left,
                    } : undefined}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        const next = new Set(targetedAgents);
                        if (next.has(pid)) next.delete(pid); else next.add(pid);
                        setTargetedAgents(next);
                        setActiveParticipantMenu(null);
                      }}
                      className="w-full text-start px-3 py-2 text-xs text-on-surface hover:bg-surface-secondary transition-colors flex items-center gap-2"
                    >
                      {targetedAgents.has(pid) ? '✓ ' : '○ '}
                      {isRTL ? 'وجّه الرسالة التالية له' : 'Target next message'}
                    </button>
                    <button
                      onClick={() => {
                        if (participants.length <= 1) {
                          alert(isRTL ? 'لا يمكن إخراج آخر مشارك' : 'Cannot remove last participant');
                          return;
                        }
                        if (!confirm(isRTL ? `إخراج ${info.name[language]} من المحادثة؟` : `Remove ${info.name[language]} from chat?`)) return;
                        removeParticipant(pid);
                      }}
                      className="w-full text-start px-3 py-2 text-xs text-red-500 hover:bg-surface-secondary transition-colors flex items-center gap-2 border-t border-border"
                    >
                      <X size={12} />
                      {isRTL ? 'أزل من المحادثة' : 'Remove from chat'}
                    </button>
                  </div>
                  );
                })()}
              </div>
            );
          })}

          {/* Add agent button */}
          <div className="relative shrink-0" ref={addAgentRef}>
            <button
              onClick={() => setShowAddAgent(!showAddAgent)}
              className="w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center border-2 border-dashed border-on-surface-tertiary/30 text-on-surface-tertiary hover:border-accent hover:text-accent transition-colors"
              title={isRTL ? 'أضف وكيل' : 'Add agent'}
            >
              <Plus size={14} />
            </button>

            {/* Add agent dropdown — rendered as portal-like fixed so it escapes overflow */}
            {showAddAgent && availableToAdd.length > 0 && (
              <div className="fixed mt-1 z-[100] bg-surface border border-border rounded-[var(--radius)] shadow-xl min-w-[240px] max-w-[300px] max-h-[320px] overflow-y-auto"
                style={{
                  top: addAgentRef.current ? addAgentRef.current.getBoundingClientRect().bottom + 4 : 0,
                  [isRTL ? 'right' : 'left']: addAgentRef.current ? (isRTL ? window.innerWidth - addAgentRef.current.getBoundingClientRect().right : addAgentRef.current.getBoundingClientRect().left) : 0
                }}>
                {availableToAdd.map((agent) => {
                  const display = agentDisplay[agent.id] || BUILTIN_AGENT_DISPLAY.manager;
                  return (
                    <button
                      key={agent.id}
                      onClick={() => addParticipant(agent.id)}
                      className="w-full text-start px-3 py-2.5 hover:bg-surface-secondary transition-colors flex items-center gap-2.5"
                    >
                      <span
                        className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0',
                          display.bgColor
                        )}
                      >
                        {display.initial}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-on-surface truncate">
                          {agent.name[language]}
                        </p>
                        <p className="text-[10px] text-on-surface-tertiary truncate">
                          {agent.desc[language]}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chain progress: visible when sequential multi-mention is active */}
      {nextAgentToTriggerRef.current && isStreaming && (
        <div className="px-4 pt-3">
          <div className="max-w-3xl mx-auto rounded-lg border border-blue-400/60 bg-blue-500/10 p-2 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
            <span>⛓️</span>
            <span>{isRTL ? 'سلسلة مهام: بعد ردّ الوكيل الحالي، سيُكلَّف' : 'Chain in progress: after current reply, will trigger'} <strong>{agentDisplay[nextAgentToTriggerRef.current]?.name[language] || nextAgentToTriggerRef.current}</strong></span>
          </div>
        </div>
      )}

      {/* Approval popup — appears in chat when an agent requests permission */}
      {pendingApprovals.length > 0 && (
        <div className="px-4 pt-4">
          <div className="max-w-3xl mx-auto space-y-2">
            {pendingApprovals.map((ap) => (
              <div key={ap.id} className="rounded-lg border-2 border-amber-400/60 bg-amber-500/10 p-3 shadow-md animate-in fade-in">
                <div className="flex items-start gap-2">
                  <div className="text-amber-500 text-xl">⚠️</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-on-surface">{ap.title[language]}</p>
                    <p className="text-xs text-on-surface-secondary mt-0.5">{ap.description}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => resolveApproval(ap.id, 'approve')}
                    className="flex-1 h-8 rounded text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600"
                  >
                    {isRTL ? '✓ موافق' : '✓ Approve'}
                  </button>
                  <button
                    onClick={() => resolveApproval(ap.id, 'reject')}
                    className="flex-1 h-8 rounded text-xs font-semibold bg-surface-secondary text-on-surface hover:bg-red-500/10 hover:text-red-500"
                  >
                    {isRTL ? '✗ رفض' : '✗ Reject'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((msg) => {
            const agentInfo = msg.role === 'assistant'
              ? getMessageAgentInfo(msg)
              : BUILTIN_AGENT_DISPLAY.manager;
            // Use agentDisplay sent from server when present (Wave B payload),
            // else fall back to local registry.
            const nameAr = msg.agentDisplay?.ar || agentInfo.name.ar;
            const nameEn = msg.agentDisplay?.en || agentInfo.name.en;
            const assistantName = language === 'ar' ? nameAr : nameEn;
            const assistantTranslit = language === 'ar' ? nameEn : nameAr;
            const avatarColor = msg.role === 'user'
              ? 'bg-accent/10 text-accent'
              : agentInfo.color;
            // CHAT_V2 Wave D bubble-kind styling.
            const isHandoff = msg.kind === 'handoff';
            const isProgress = msg.kind === 'progress' || (msg.streaming && !msg.content);
            const isArtifact = msg.kind === 'artifact';
            const timestamp = formatRelativeTime(msg.createdAt, isRTL);
            return (
              <div
                key={msg.id}
                className={cn(
                  'group flex gap-3 relative',
                  isHandoff && 'opacity-75'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-medium shadow-sm',
                    msg.role === 'user' ? avatarColor : agentInfo.bgColor,
                    isProgress && 'animate-pulse'
                  )}
                  title={msg.role === 'assistant' ? `${nameAr} / ${nameEn}` : undefined}
                >
                  {msg.role === 'user' ? <User size={16} /> : (agentInfo.initial || <Bot size={16} />)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                    <p className={cn(
                      'text-xs font-medium',
                      isHandoff ? 'text-on-surface-tertiary italic' : 'text-on-surface-secondary'
                    )}>
                      {msg.role === 'user' ? (isRTL ? 'أنت' : 'You') : assistantName}
                    </p>
                    {msg.role === 'assistant' && assistantTranslit && assistantTranslit !== assistantName && (
                      <p className="text-[10px] text-on-surface-tertiary" dir={language === 'ar' ? 'ltr' : 'rtl'}>
                        {assistantTranslit}
                      </p>
                    )}
                    {msg.dispatchStep && (
                      <span className={cn(
                        'text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide',
                        msg.dispatchStep === 'synthesis' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' :
                        msg.dispatchStep === 'worker' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400' :
                        'bg-muted text-muted-foreground'
                      )}>
                        {msg.dispatchStep === 'synthesis' ? (isRTL ? 'تجميع' : 'synthesis') :
                         msg.dispatchStep === 'worker' ? (isRTL ? 'عامل' : 'worker') :
                         msg.dispatchStep === 'dept-selected' ? (isRTL ? 'توجيه' : 'routing') :
                         msg.dispatchStep}
                      </span>
                    )}
                    {timestamp && (
                      <p className="text-[10px] text-on-surface-tertiary ml-auto shrink-0">
                        {timestamp}
                      </p>
                    )}
                  </div>
                  {isProgress && !msg.content && (
                    <p className="text-xs italic text-on-surface-tertiary mb-1">
                      {isRTL ? 'جاري العمل…' : 'working…'}
                    </p>
                  )}
                  {msg.role === 'assistant' && isResearchResult(msg.content) ? (
                    <ResultCard
                      content={msg.content}
                      agentName={assistantName}
                      isRTL={isRTL}
                    />
                  ) : msg.content ? (
                    <div
                      className={cn(
                        proseClasses,
                        isHandoff && 'italic text-on-surface-tertiary border-dashed border-s-2 border-border ps-2',
                        isProgress && 'border-s-2 border-accent ps-2 animate-pulse',
                        msg.errored && 'text-red-500',
                      )}
                      dir={/[\u0600-\u06FF]/.test(msg.content) ? 'rtl' : 'ltr'}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content.replace(/@([\u0600-\u06FF\w'-]+)/gu, '**@$1**')}
                      </ReactMarkdown>
                    </div>
                  ) : null}
                  {/* Artifacts: inline previews below the bubble body */}
                  {(isArtifact || (msg.artifacts && msg.artifacts.length > 0)) && msg.artifacts && (
                    <div className="mt-2 flex flex-col gap-2">
                      {msg.artifacts.map((a, i) => (
                        <ArtifactPreview key={a.id || `${msg.id}-a-${i}`} artifact={a} isRTL={isRTL} />
                      ))}
                    </div>
                  )}
                </div>
                {/* Action buttons — appear on hover (top-end of message) */}
                <div
                  className="absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                  style={isRTL ? { left: 0 } : { right: 0 }}
                >
                  {/* @Mention button — quickly reply to this agent */}
                  {msg.role === 'assistant' && msg.agentId && msg.agentId !== 'system' && (
                    <button
                      onClick={() => {
                        const info = agentDisplay[msg.agentId!];
                        if (!info) return;
                        const mention = `@${info.name[language]} `;
                        setInput((prev) => prev.includes(mention.trim()) ? prev : mention + prev);
                        inputRef.current?.focus();
                      }}
                      className="p-1.5 rounded-[var(--radius)] text-on-surface-tertiary hover:text-accent hover:bg-accent/10"
                      title={isRTL ? 'منشن — رد عليه مباشرة' : 'Mention — reply directly'}
                    >
                      <span className="text-xs font-bold">@</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const authorAgentId = msg.role === 'assistant' ? msg.agentId : undefined;
                      const authorName = msg.role === 'user'
                        ? (isRTL ? 'أنت' : 'You')
                        : (authorAgentId && agentDisplay[authorAgentId]?.name[language]) || (isRTL ? 'وكيل' : 'Agent');
                      setReplyingTo({
                        id: msg.id,
                        authorName,
                        authorAgentId,
                        preview: msg.content.replace(/\s+/g, ' ').slice(0, 140),
                      });
                      inputRef.current?.focus();
                    }}
                    className="p-1.5 rounded-[var(--radius)] text-on-surface-tertiary hover:text-accent hover:bg-accent/10"
                    title={isRTL ? 'رد على هذه الرسالة' : 'Reply to this message'}
                  >
                    <CornerUpLeft size={14} />
                  </button>
                  <button
                    onClick={() => navigator.clipboard.writeText(msg.content)}
                    className="p-1.5 rounded-[var(--radius)] text-on-surface-tertiary hover:text-on-surface-secondary hover:bg-surface-secondary"
                    title={isRTL ? 'نسخ' : 'Copy'}
                  >
                    <Copy size={14} />
                  </button>
                  {/* Retry — only on USER messages. Removes this message + everything
                      after it, then re-sends it so the agent(s) reply again. */}
                  {msg.role === 'user' && (
                    <button
                      onClick={() => {
                        if (isStreamingRef.current) return;
                        const idx = messages.findIndex((m) => m.id === msg.id);
                        if (idx < 0) return;
                        const userText = msg.content;
                        const userAgentId = msg.agentId;
                        // Drop this user message and everything after it; sendMessage
                        // will append a fresh copy and open a new stream.
                        setMessages((prev) => prev.slice(0, idx));
                        setTimeout(() => sendMessage(userText, userAgentId), 30);
                      }}
                      className="p-1.5 rounded-[var(--radius)] text-on-surface-tertiary hover:text-accent hover:bg-accent/10"
                      title={isRTL ? 'أعد الإرسال' : 'Resend'}
                    >
                      <RotateCcw size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* CHAT_V2 Wave D — per-agent typing indicators (only for agents
              that are streaming but whose bubble is still empty). */}
          {chatV2 &&
            activeStreamingAgents
              .filter((aid) => !messages.some((m) => m.agentId === aid && m.streaming && m.content))
              .map((aid) => {
                const info = agentDisplay[aid] || BUILTIN_AGENT_DISPLAY.manager;
                return (
                  <TypingIndicator
                    key={`typing-${aid}`}
                    agentId={aid}
                    agentName={info.name[language]}
                    avatarInitial={info.initial}
                    avatarColor={info.bgColor}
                    isRTL={isRTL}
                  />
                );
              })}

          {/* Active background task cards */}
          {Array.from(activeTasks.entries()).map(([taskId]) => (
            <div key={taskId} className="flex gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-purple-500/20 text-purple-600 dark:text-purple-400">
                <Bot size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-on-surface-tertiary mb-1">
                  {isRTL ? 'الباحث' : 'Al-Bahith'}
                </p>
                <TaskProgressCard
                  taskId={taskId}
                  isRTL={isRTL}
                  onComplete={(result) => {
                    const resultMsg: Message = {
                      id: crypto.randomUUID(),
                      role: 'assistant',
                      content: result,
                      agentId: 'research',
                    };
                    setMessages((prev) => [...prev, resultMsg]);
                    setActiveTasks((prev) => {
                      const next = new Map(prev);
                      next.delete(taskId);
                      return next;
                    });
                  }}
                />
              </div>
            </div>
          ))}

          {/* Streaming message */}
          {streamingContent && (() => {
            const sInfo = agentDisplay[streamingAgentId] || BUILTIN_AGENT_DISPLAY.manager;
            return (
              <div className="flex gap-3">
                <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0', sInfo.color)}>
                  <Bot size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-on-surface-tertiary mb-1">
                    {sInfo.name[language]}
                  </p>
                  <div
                    className="text-sm text-on-surface leading-relaxed break-words prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-pre:bg-surface-secondary prose-pre:rounded-lg prose-pre:p-3 prose-code:text-accent prose-code:bg-surface-secondary prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs"
                    dir={/[\u0600-\u06FF]/.test(streamingContent) ? 'rtl' : 'ltr'}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {streamingContent}
                    </ReactMarkdown>
                    <span className="inline-block w-2 h-4 bg-accent animate-pulse ml-0.5" />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Loading indicator */}
          {isStreaming && !streamingContent && (() => {
            const sInfo = agentDisplay[streamingAgentId] || BUILTIN_AGENT_DISPLAY.manager;
            return (
              <div className="flex gap-3">
                <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0', sInfo.color)}>
                  <Bot size={16} />
                </div>
                <div className="flex items-center gap-2 text-on-surface-tertiary">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-sm">{isRTL ? 'يفكر...' : 'Thinking...'}</span>
                </div>
              </div>
            );
          })()}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input -- sticky at bottom on mobile */}
      <div className="border-t border-border px-4 py-3 shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="relative bg-input border border-border rounded-[var(--radius-lg)] focus-within:ring-2 focus-within:ring-ring transition-shadow">
            {/* @Mention Autocomplete Popup */}
            {showMentionPopup && mentionAgents.length > 0 && (
              <div
                ref={mentionPopupRef}
                className="absolute bottom-full mb-1 left-0 right-0 mx-4 bg-surface border border-border rounded-[var(--radius)] shadow-lg z-50 max-h-[200px] overflow-y-auto"
              >
                {mentionAgents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => insertMention(agent.id)}
                    className="w-full text-start px-3 py-2 hover:bg-surface-secondary transition-colors flex items-center gap-2"
                  >
                    <span
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0',
                        agent.bgColor
                      )}
                    >
                      {agent.initial}
                    </span>
                    <span className="text-xs text-on-surface">
                      {agent.name[language]}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Recording indicator */}
            {isRecording && (
              <div className="px-4 py-2 border-b border-border">
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  {isRTL ? 'جاري التسجيل...' : 'Recording...'} {recordingDuration}s
                </div>
                {liveTranscript && (
                  <p className="text-xs text-on-surface-secondary mt-1 italic truncate">
                    {liveTranscript}
                  </p>
                )}
              </div>
            )}

            {/* Disambiguation popup: detected agent names without @ */}
            {nameSuggestions.length > 0 && (
              <div className="mb-2 rounded-lg border border-amber-400/60 bg-amber-500/10 p-2.5 space-y-1.5 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-amber-600 dark:text-amber-400">💡</span>
                  <span className="text-on-surface-secondary">
                    {isRTL ? 'هل تقصد التوجيه لـ' : 'Do you mean to address'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {nameSuggestions.map((s) => (
                    <button key={s.id} onClick={() => {
                      // Replace the bare name with @name in the input
                      setInput((prev) => prev.replace(new RegExp(`(?<![@\\w])${s.name}(?![\\w])`, 'gu'), `@${s.name}`));
                      setNameSuggestions((prev) => prev.filter((x) => x.id !== s.id));
                      setDismissedSuggestionIds((prev) => new Set([...prev, s.id]));
                    }} className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-500/30">
                      ✓ @{s.name}
                    </button>
                  ))}
                  <button onClick={() => {
                    setDismissedSuggestionIds((prev) => new Set([...prev, ...nameSuggestions.map((s) => s.id)]));
                    setNameSuggestions([]);
                  }} className="px-2.5 py-1 rounded-full bg-surface-secondary text-on-surface-tertiary text-xs hover:bg-surface-tertiary">
                    ✕ {isRTL ? 'لا، فقط ذكر' : 'No, just mention'}
                  </button>
                  <button onClick={() => {
                    setInput((prev) => '@الراعي ' + prev);
                    setNameSuggestions([]);
                  }} className="px-2.5 py-1 rounded-full bg-accent text-on-accent text-xs font-semibold hover:opacity-90">
                    👨‍💼 {isRTL ? 'للراعي' : 'To Manager'}
                  </button>
                </div>
              </div>
            )}

            {/* Topic suggestions: agents whose expertise matches this message */}
            {topicSuggestions.length > 0 && (
              <div className="mb-2 rounded-lg border border-sky-400/60 bg-sky-500/10 p-2.5 space-y-2 animate-in fade-in slide-in-from-bottom-2">
                {topicSuggestions.map((t) => {
                  const isParticipant = participants.includes(t.id);
                  return (
                    <div key={t.id} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-sky-600 dark:text-sky-400 shrink-0">💡</span>
                      <span className="text-on-surface-secondary flex-1 min-w-0">
                        {isRTL ? 'موضوعك يتعلق بـ' : 'Your topic relates to'}{' '}
                        <strong className="text-on-surface">{t.name}</strong>{' '}
                        <span className="text-on-surface-tertiary">({t.reason})</span>
                      </span>
                      {!isParticipant && (
                        <button
                          onClick={() => {
                            addParticipant(t.id);
                            setTopicSuggestions((prev) => prev.filter((x) => x.id !== t.id));
                          }}
                          className="px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-700 dark:text-sky-300 text-xs font-semibold hover:bg-sky-500/30"
                        >
                          ➕ {isRTL ? 'أضفه' : 'Summon'}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setInput((prev) => prev.includes(`@${t.name}`) ? prev : `@${t.name} ${prev}`);
                          setTopicSuggestions((prev) => prev.filter((x) => x.id !== t.id));
                          inputRef.current?.focus();
                        }}
                        className="px-2.5 py-1 rounded-full bg-accent text-on-accent text-xs font-semibold hover:opacity-90"
                      >
                        💬 {isRTL ? 'وجّه له' : 'Route'}
                      </button>
                      <button
                        onClick={() => setTopicSuggestions((prev) => prev.filter((x) => x.id !== t.id))}
                        className="px-2 py-1 rounded-full bg-surface-secondary text-on-surface-tertiary text-xs hover:bg-surface-tertiary"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {pendingImages.length > 0 && (
              <div className="mx-2 mt-2 mb-1 flex items-center gap-2 flex-wrap" dir={isRTL ? 'rtl' : 'ltr'}>
                {pendingImages.map((img) => (
                  <div key={img.id} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.previewUrl} alt={img.name} className="w-16 h-16 object-cover rounded-[var(--radius)] border border-border" />
                    <button
                      onClick={() => setPendingImages((prev) => prev.filter((x) => x.id !== img.id))}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-error text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <span className="text-xs text-on-surface-tertiary">
                  {isRTL ? `${pendingImages.length} صورة — الفطين سيحلّلها` : `${pendingImages.length} image(s) — Al-Fatin will analyze`}
                </span>
              </div>
            )}

            {replyingTo && (
              <div
                className="mx-2 mt-2 mb-1 flex items-start gap-2 rounded-[var(--radius)] border-s-2 border-accent bg-accent/5 px-3 py-2 text-xs"
                dir={isRTL ? 'rtl' : 'ltr'}
              >
                <CornerUpLeft size={14} className="mt-0.5 text-accent shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-accent">
                    {isRTL ? 'رد على' : 'Replying to'} {replyingTo.authorName}
                  </div>
                  <div className="text-on-surface-tertiary truncate">{replyingTo.preview}</div>
                </div>
                <button
                  onClick={() => setReplyingTo(null)}
                  className="p-1 rounded hover:bg-surface-secondary text-on-surface-tertiary"
                  title={isRTL ? 'إلغاء' : 'Cancel'}
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={isRTL ? 'اكتب رسالتك... استخدم @ لمنادات وكيل' : 'Type a message... Use @ to mention an agent'}
              rows={1}
              dir={isRTL ? 'rtl' : 'ltr'}
              disabled={isStreaming || isRecording}
              className={cn(
                'w-full resize-none bg-transparent px-4 py-3 text-on-surface placeholder:text-on-surface-tertiary focus:outline-none disabled:opacity-50',
                isRTL ? 'pl-28' : 'pr-28'
              )}
              style={{ minHeight: '48px', maxHeight: '120px' }}
            />
            <div className={cn(
              'absolute bottom-2 flex items-center gap-1',
              isRTL ? 'left-2' : 'right-2'
            )}>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming || isRecording}
                className="p-2 rounded-[var(--radius)] text-on-surface-tertiary hover:text-accent hover:bg-accent/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                title={isRTL ? 'أرفق صور' : 'Attach images'}
              >
                <ImageIcon size={18} />
              </button>
              <button
                onClick={() => cameraInputRef.current?.click()}
                disabled={isStreaming || isRecording}
                className="p-2 rounded-[var(--radius)] text-on-surface-tertiary hover:text-accent hover:bg-accent/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                title={isRTL ? 'كاميرا' : 'Camera'}
              >
                <Camera size={18} />
              </button>
              <ScreenShareButton isRTL={isRTL} onAnalysis={(text) => {
                const msg: Message = { id: crypto.randomUUID(), role: 'assistant', content: text, agentId: 'fatin' };
                setMessages((prev) => [...prev, msg]);
              }} />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => { if (e.target.files) handleImageFiles(e.target.files); e.target.value = ''; }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => { if (e.target.files) handleImageFiles(e.target.files); e.target.value = ''; }}
              />
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isStreaming}
                className={cn(
                  'p-2 rounded-[var(--radius)] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center',
                  isRecording
                    ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                    : 'text-on-surface-tertiary hover:text-on-surface-secondary hover:bg-surface-secondary'
                )}
              >
                {isRecording ? <Square size={18} /> : <Mic size={18} />}
              </button>
              <button
                onClick={() => setVoiceModeOpen(true)}
                disabled={isStreaming || isRecording}
                className="p-2 rounded-[var(--radius)] text-on-surface-tertiary hover:text-accent hover:bg-accent/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                title={isRTL ? 'وضع الصوت' : 'Voice Mode'}
              >
                <Headphones size={18} />
              </button>
              {isStreaming ? (
                <button
                  onClick={() => {
                    cancelRef.current?.();
                    // Preserve partial content as a message — don't discard it
                    const partial = streamingContent;
                    if (partial && partial.trim()) {
                      setMessages((msgs) => [...msgs, {
                        id: crypto.randomUUID(),
                        role: 'assistant',
                        content: partial + '\n\n_(توقف بواسطة المستخدم)_',
                        agentId: streamingAgentId || undefined,
                      }]);
                    }
                    setIsStreaming(false);
                    setStreamingContent('');
                  }}
                  className="p-2 rounded-[var(--radius)] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center bg-error/10 text-error hover:bg-error/20"
                  title={isRTL ? 'إيقاف' : 'Stop'}
                >
                  <Square size={16} fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim()}
                  className={cn(
                    'p-2 rounded-[var(--radius)] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center',
                    input.trim()
                      ? 'bg-accent text-on-accent hover:bg-accent-hover'
                      : 'text-on-surface-tertiary'
                  )}
                >
                  <Send size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Voice Mode Overlay */}
      {voiceModeOpen && (
        <VoiceMode
          conversationId={convId}
          agentId={agentId}
          selectedModel={'claude-sonnet-4-6'}
          onClose={() => setVoiceModeOpen(false)}
          onMessage={(userText, assistantText) => {
            const userMsg: Message = {
              id: crypto.randomUUID(),
              role: 'user',
              content: userText,
            };
            const assistantMsg: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: assistantText,
            };
            setMessages((prev) => [...prev, userMsg, assistantMsg]);
          }}
          onConversationCreated={(id) => {
            setConvId(id);
            onConversationCreated?.(id);
          }}
        />
      )}
    </div>
  );
}
