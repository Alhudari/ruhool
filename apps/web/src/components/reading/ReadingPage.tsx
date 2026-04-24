'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  Send,
  X,
} from 'lucide-react';
import { useAppStore } from '@/store/app';
import { apiFetch, apiStream } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PaperView, type PageData } from './PaperView';
import {
  AnalysisPanel,
  type AnalysisData,
  type AnalysisEditPatch,
  type HighlightItem,
} from './AnalysisPanel';
import type { HighlightColor } from './HighlightSwatch';
import { RefineBar } from './RefineBar';
import { VersionHistory } from './VersionHistory';
import { UserNotesPanel } from './UserNotesPanel';

type ReadingMode = 'page' | 'rolling' | 'full' | 'tac';

interface SessionData {
  id: string;
  title?: string | null;
  paperTitle?: string;
  language: 'en' | 'ar';
  totalPages: number;
  source?: string;
  readingMode?: ReadingMode;
  runningSynthesis?: string | null;
  userNotes?: Record<string, string>;
}

interface SessionDetailResponse {
  session: SessionData & {
    paperTitle: string;
    paperMeta?: { authors?: string; year?: number | null; doi?: string };
    runningSynthesis?: string | null;
    userNotes?: Record<string, string>;
    readingMode?: ReadingMode;
  };
  pageAnalyses: Array<{
    id: string;
    pageNumber: number;
    version: number;
    analysis: Record<string, unknown>;
    humanEdited?: boolean;
  }>;
}

interface BackendAnalyzeResult {
  id?: string;
  main_idea?: string;
  table_data?: string;
  library_link?: { exists: boolean; paper?: string; note?: string };
  phd_relevance?: string;
  tags?: string[];
  highlights?: Array<{ text: string; color: HighlightColor; reason: string }>;
  question?: string | null;
  arabic_takeaway?: string[];
}

interface ShwashaPageResponse {
  number: number;
  text: string;
  imageUrl?: string | null;
  totalPages?: number;
}

function mapAnalysis(
  raw: BackendAnalyzeResult | null | undefined,
  meta?: { id?: string; humanEdited?: boolean }
): AnalysisData | null {
  if (!raw) return null;
  const analysis: AnalysisData = {
    analysisId: meta?.id ?? raw.id,
    humanEdited: meta?.humanEdited,
    mainIdea: raw.main_idea,
    tags: raw.tags,
    highlights: (raw.highlights as HighlightItem[] | undefined) ?? undefined,
    phdRelevance: raw.phd_relevance,
    question: raw.question ?? undefined,
    arabicTakeaway: raw.arabic_takeaway,
  };
  if (raw.library_link?.exists && raw.library_link.paper) {
    analysis.libraryLink = {
      paper: { title: raw.library_link.paper },
      note: raw.library_link.note,
    };
  }
  return analysis;
}

const MODE_LABEL: Record<ReadingMode, { en: string; ar: string; hint: { en: string; ar: string } }> = {
  rolling: {
    en: 'Rolling',
    ar: 'تراكمي',
    hint: { en: 'Synthesis carries across pages', ar: 'الخلاصة تتراكم عبر الصفحات' },
  },
  page: {
    en: 'Page',
    ar: 'صفحة',
    hint: { en: 'Each page analyzed independently', ar: 'كل صفحة تُحلَّل باستقلال' },
  },
  full: {
    en: 'Full',
    ar: 'كامل',
    hint: { en: 'Whole paper context (~10× cost)', ar: 'كامل الورقة (تكلفة ×10)' },
  },
  tac: {
    en: 'TAC',
    ar: 'تصفح',
    hint: { en: 'Title + abstract + conclusion only', ar: 'العنوان + المقدمة + الخاتمة فقط' },
  },
};

interface ReadingPageProps {
  sessionId: string | null;
}

export function ReadingPage({ sessionId }: ReadingPageProps) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const router = useRouter();

  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [page, setPage] = useState<PageData | null>(null);
  const [pageImageRequested, setPageImageRequested] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [latestVersionIds, setLatestVersionIds] = useState<Map<number, string>>(new Map());
  const [viewingOlderVersion, setViewingOlderVersion] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamProgress, setStreamProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [warningToast, setWarningToast] = useState<string | null>(null);
  const [synthesisOpen, setSynthesisOpen] = useState(false);
  const [approvedPages, setApprovedPages] = useState<Set<number>>(new Set());

  // ─── J-12: Reading status + depth ───
  type ReadingStatus = 'to-read' | 'skimming' | 'reading' | 'paused' | 'done';
  type ReadingDepth = 'title-abstract-conclusion' | 'scan-only' | 'selective' | 'full';
  const [sessionReadingStatus, setSessionReadingStatus] = useState<ReadingStatus>('reading');
  const [sessionReadingDepth, setSessionReadingDepth] = useState<ReadingDepth | ''>('');
  const [pauseNote, setPauseNote] = useState('');
  const [statusBarOpen, setStatusBarOpen] = useState(false);

  const STATUS_LABELS: Record<ReadingStatus, { en: string; ar: string }> = {
    'to-read':  { en: 'To Read',  ar: 'للقراءة' },
    'skimming': { en: 'Skimming', ar: 'تصفح' },
    'reading':  { en: 'Reading',  ar: 'يُقرأ' },
    'paused':   { en: 'Paused',   ar: 'موقوف' },
    'done':     { en: 'Done',     ar: 'مكتمل' },
  };
  const DEPTH_LABELS: Record<ReadingDepth, { en: string; ar: string }> = {
    'title-abstract-conclusion': { en: 'Title/Abstract/Conclusion', ar: 'عنوان/ملخص/خاتمة' },
    'scan-only':  { en: 'Scan only',  ar: 'تصفح فقط' },
    'selective':  { en: 'Selective',  ar: 'انتقائي' },
    'full':       { en: 'Full read',  ar: 'قراءة كاملة' },
  };

  const updateStatus = async (status: ReadingStatus) => {
    setSessionReadingStatus(status);
    if (!sessionId) return;
    await apiFetch(`/api/reading/sessions/${sessionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readingStatus: status, pauseNote: status === 'paused' ? pauseNote : undefined }),
    }).catch(() => {});
  };

  // ─── TAC mode ───
  const [tacSubmitting, setTacSubmitting] = useState(false);
  const [tacCandidates, setTacCandidates] = useState<Array<{ index: number; title: string; snippet: string }> | null>(null);
  const [tacSelection, setTacSelection] = useState<[number | null, number | null, number | null]>([null, null, null]);

  // ─── Per-page chat ───
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; text: string }>>([]);
  const [chatStreaming, setChatStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // ─── Draft notes + auto-save ───
  const [draftNotes, setDraftNotes] = useState('');
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushDraftSave = useCallback(async (notes: string) => {
    if (!sessionId) return;
    try {
      const res = await apiFetch<{ ok: boolean; savedAt: string }>(
        `/api/shwasha/sessions/${sessionId}/draft`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draftNotes: notes }) }
      );
      setDraftSavedAt(res.savedAt);
    } catch { /* silent */ }
  }, [sessionId]);

  const onDraftChange = useCallback((notes: string) => {
    setDraftNotes(notes);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => flushDraftSave(notes), 30_000);
  }, [flushDraftSave]);

  // ─── Undo/redo ───
  const undoStack = useRef<Array<{ field: string; previousValue: unknown }>>([]);
  const pushUndo = useCallback((field: string, previousValue: unknown) => {
    undoStack.current.push({ field, previousValue });
    if (!sessionId) return;
    apiFetch(`/api/shwasha/sessions/${sessionId}/undo-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, previousValue }),
    }).catch(() => undefined);
  }, [sessionId]);

  const popUndo = useCallback(async () => {
    if (!sessionId) return;
    const entry = undoStack.current.pop();
    if (!entry) return;
    await apiFetch(`/api/shwasha/sessions/${sessionId}/undo-pop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => undefined);
    // Apply locally
    if (entry.field === 'analysis' && entry.previousValue) {
      setAnalysis(entry.previousValue as AnalysisData);
    }
  }, [sessionId]);

  // Keyboard undo/redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        popUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popUndo]);

  const cancelStreamRef = useRef<(() => void) | null>(null);
  const analysisCache = useRef<Map<number, AnalysisData | null>>(new Map());
  // Cache per analysisId (for older versions).
  const versionCache = useRef<Map<string, AnalysisData>>(new Map());
  const pageAnalysisIds = useRef<Map<number, string>>(new Map());

  const readingMode: ReadingMode = session?.readingMode ?? 'rolling';

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    apiFetch<SessionDetailResponse>(`/api/shwasha/sessions/${sessionId}`)
      .then((res) => {
        const sess = res.session;
        setSession({
          id: sess.id,
          title: sess.paperTitle ?? null,
          paperTitle: sess.paperTitle,
          language: sess.language,
          totalPages: sess.totalPages,
          source: sess.source,
          readingMode: sess.readingMode,
          runningSynthesis: sess.runningSynthesis ?? null,
          userNotes: sess.userNotes ?? {},
        });
        const latestByPage = new Map<number, { version: number; id: string; analysis: BackendAnalyzeResult; humanEdited?: boolean }>();
        for (const pa of res.pageAnalyses || []) {
          // Cache every version by id for quick switching.
          const mapped = mapAnalysis(pa.analysis as BackendAnalyzeResult, { id: pa.id, humanEdited: pa.humanEdited });
          if (mapped) versionCache.current.set(pa.id, mapped);
          const prev = latestByPage.get(pa.pageNumber);
          if (!prev || pa.version > prev.version) {
            latestByPage.set(pa.pageNumber, {
              version: pa.version,
              id: pa.id,
              analysis: pa.analysis as BackendAnalyzeResult,
              humanEdited: pa.humanEdited,
            });
          }
        }
        const latestMap = new Map<number, string>();
        for (const [n, entry] of latestByPage.entries()) {
          analysisCache.current.set(
            n,
            mapAnalysis(entry.analysis, { id: entry.id, humanEdited: entry.humanEdited })
          );
          pageAnalysisIds.current.set(n, entry.id);
          latestMap.set(n, entry.id);
        }
        setLatestVersionIds(latestMap);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load session');
        setLoading(false);
      });
  }, [sessionId]);

  const loadPage = useCallback(
    async (n: number) => {
      if (!sessionId) return;
      try {
        const p = await apiFetch<ShwashaPageResponse>(
          `/api/shwasha/sessions/${sessionId}/pages/${n}`
        );
        setPage({ number: p.number, text: p.text, imageUrl: p.imageUrl ?? null });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load page');
      }
    },
    [sessionId]
  );

  const streamAnalysis = useCallback(
    async (n: number) => {
      if (!sessionId) return;
      if (cancelStreamRef.current) cancelStreamRef.current();

      setIsStreaming(true);
      setAnalysis(null);
      setViewingOlderVersion(false);

      let pageText = '';
      try {
        const p = await apiFetch<ShwashaPageResponse>(
          `/api/shwasha/sessions/${sessionId}/pages/${n}`
        );
        pageText = p.text || '';
        setPage({ number: p.number, text: p.text, imageUrl: p.imageUrl ?? null });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load page text');
        setIsStreaming(false);
        return;
      }

      if (!pageText.trim()) {
        setIsStreaming(false);
        setError(
          isRTL
            ? 'لا يوجد نص لهذه الصفحة بعد.'
            : 'No text available for this page yet.'
        );
        return;
      }

      let streamBuffer = '';

      const cancel = apiStream(
        '/api/shwasha/analyze',
        {
          sessionId,
          pageNumber: n,
          pageText,
          paperContext: session?.paperTitle ? { title: session.paperTitle } : undefined,
        },
        (event, data) => {
          const d = data as Record<string, unknown>;
          if (event === 'message.start') {
            streamBuffer = '';
            setStreamProgress(0);
            // Keep analysis null during streaming so the skeleton + progress bar
            // render. We never surface the raw JSON delta stream to the user.
          } else if (event === 'message.delta') {
            const chunk = typeof d.text === 'string' ? d.text : '';
            streamBuffer += chunk;
            setStreamProgress(streamBuffer.length);
          } else if (event === 'message.done') {
            const analysisId = typeof d.analysisId === 'string' ? d.analysisId : undefined;
            const mapped = mapAnalysis(d.analysis as BackendAnalyzeResult, { id: analysisId, humanEdited: false });
            if (mapped) {
              setAnalysis(mapped);
              analysisCache.current.set(n, mapped);
              if (analysisId) versionCache.current.set(analysisId, mapped);
            }
            if (analysisId) {
              pageAnalysisIds.current.set(n, analysisId);
              setLatestVersionIds((prev) => {
                const next = new Map(prev);
                next.set(n, analysisId);
                return next;
              });
            }
            if (d.costWarning === true) {
              setWarningToast(
                isRTL
                  ? 'تنبيه: وضع الكاتب الكامل مكلف (×10).'
                  : 'Cost warning: full-context mode is ~10× expensive.'
              );
              setTimeout(() => setWarningToast(null), 3500);
            }
          } else if (event === 'message.error') {
            setError(typeof d.error === 'string' ? d.error : 'Analysis failed');
          }
        },
        () => {
          setIsStreaming(false);
          setStreamProgress(0);
          cancelStreamRef.current = null;
        },
        (err) => {
          setError(err);
          setIsStreaming(false);
          setStreamProgress(0);
          cancelStreamRef.current = null;
        }
      );
      cancelStreamRef.current = cancel;
    },
    [sessionId, session, isRTL]
  );

  useEffect(() => {
    if (!session) return;
    // TAC mode: digest is rendered separately — don't auto-stream per page.
    if (session.readingMode === 'tac') {
      setIsStreaming(false);
      const cached = analysisCache.current.get(0) ?? analysisCache.current.get(1);
      setAnalysis(cached ?? null);
      setViewingOlderVersion(false);
      return;
    }
    const cached = analysisCache.current.get(pageNumber);
    if (cached !== undefined) {
      loadPage(pageNumber);
      setAnalysis(cached);
      setIsStreaming(false);
      setViewingOlderVersion(false);
    } else {
      streamAnalysis(pageNumber);
    }
    setPageImageRequested(false);
    return () => {
      if (cancelStreamRef.current) cancelStreamRef.current();
    };
  }, [pageNumber, session, loadPage, streamAnalysis]);

  const totalPages = session?.totalPages ?? 0;

  const goToPage = (n: number) => {
    const bounded = Math.max(1, totalPages ? Math.min(totalPages, n) : n);
    setPageNumber(bounded);
  };

  const handleRefine = async (instruction: string, deep: boolean) => {
    if (!sessionId) return;
    const pageAnalysisId = pageAnalysisIds.current.get(pageNumber);
    if (!pageAnalysisId) {
      setError(
        isRTL
          ? 'لا يوجد تحليل محفوظ بعد لهذه الصفحة — شغّل التحليل أولاً.'
          : 'No saved analysis for this page yet — run the analysis first.'
      );
      return;
    }
    setIsStreaming(true);
    try {
      const refined = await apiFetch<{ analysis: { id: string; analysis: BackendAnalyzeResult } }>(
        `/api/shwasha/refine`,
        {
          method: 'POST',
          body: JSON.stringify({
            sessionId,
            pageAnalysisId,
            refinementRequest: instruction,
            useDeepModel: deep,
          }),
        }
      );
      const mapped = mapAnalysis(refined.analysis.analysis, { id: refined.analysis.id, humanEdited: false });
      if (mapped) {
        setAnalysis(mapped);
        analysisCache.current.set(pageNumber, mapped);
        versionCache.current.set(refined.analysis.id, mapped);
      }
      pageAnalysisIds.current.set(pageNumber, refined.analysis.id);
      setLatestVersionIds((prev) => {
        const next = new Map(prev);
        next.set(pageNumber, refined.analysis.id);
        return next;
      });
      setViewingOlderVersion(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refine failed');
    } finally {
      setIsStreaming(false);
    }
  };

  const handleApprove = () => {
    setApprovedPages((prev) => {
      const next = new Set(prev);
      next.add(pageNumber);
      return next;
    });
    setSavedToast(isRTL ? 'تمت الموافقة' : 'Approved');
    setTimeout(() => setSavedToast(null), 1800);
  };

  const handleRegenerate = () => {
    analysisCache.current.delete(pageNumber);
    streamAnalysis(pageNumber);
  };

  const handleSave = async () => {
    if (!sessionId || !analysis) return;
    try {
      await apiFetch(`/api/shwasha/save`, {
        method: 'POST',
        body: JSON.stringify({ sessionId, targets: ['zotero', 'obsidian'] }),
      });
      setSavedToast(isRTL ? 'تم الحفظ' : 'Saved');
      setTimeout(() => setSavedToast(null), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const handleAsk = () => setChatOpen((v) => !v);

  const handleChatSubmit = useCallback(() => {
    const text = chatInput.trim();
    if (!text || !sessionId || chatStreaming) return;
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    setChatMessages((m) => [...m, { id: userId, role: 'user', text }, { id: assistantId, role: 'assistant', text: '' }]);
    setChatInput('');
    setChatStreaming(true);

    apiStream(
      '/api/shwasha/chat',
      { sessionId, pageNumber, message: text },
      (event, data) => {
        if (event === 'message.delta') {
          const d = data as { text?: string };
          if (typeof d.text === 'string') {
            setChatMessages((m) => m.map((msg) => msg.id === assistantId ? { ...msg, text: msg.text + d.text } : msg));
          }
        } else if (event === 'message.error') {
          const d = data as { error?: string };
          setChatMessages((m) => m.map((msg) => msg.id === assistantId ? { ...msg, text: `⚠ ${d.error || 'error'}` } : msg));
        }
      },
      () => setChatStreaming(false),
      (err) => {
        setChatMessages((m) => m.map((msg) => msg.id === assistantId ? { ...msg, text: `⚠ ${err}` } : msg));
        setChatStreaming(false);
      }
    );
  }, [chatInput, sessionId, pageNumber, chatStreaming]);

  useEffect(() => {
    if (chatOpen) chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatMessages, chatOpen]);

  const handleRequestImage = async () => {
    if (!sessionId || pageImageRequested) return;
    setPageImageRequested(true);
    try {
      const updated = await apiFetch<ShwashaPageResponse>(
        `/api/shwasha/sessions/${sessionId}/pages/${pageNumber}?image=1`
      );
      if (updated.imageUrl) {
        setPage({ number: updated.number, text: updated.text, imageUrl: updated.imageUrl });
      } else {
        setError(
          isRTL
            ? 'عرض صورة الصفحة غير متاح بعد.'
            : 'Page-image view is not yet available.'
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image failed');
      setPageImageRequested(false);
    }
  };

  const handleRemoveTag = (tag: string) => {
    if (!analysis) return;
    const next = {
      ...analysis,
      tags: (analysis.tags ?? []).filter((t) => t !== tag),
    };
    setAnalysis(next);
    analysisCache.current.set(pageNumber, next);
  };

  // Inline edits — optimistic PATCH to /api/shwasha/analyses/:id.
  const handleEditAnalysis = async (patch: AnalysisEditPatch) => {
    if (!analysis?.analysisId) {
      setError(
        isRTL
          ? 'لا يمكن التعديل قبل اكتمال التحليل.'
          : 'Cannot edit before analysis completes.'
      );
      return;
    }
    const analysisId = analysis.analysisId;
    const before = analysis;
    const next: AnalysisData = { ...analysis, humanEdited: true };
    if (patch.main_idea !== undefined) next.mainIdea = patch.main_idea;
    if (patch.phd_relevance !== undefined) next.phdRelevance = patch.phd_relevance;
    if (patch.question !== undefined) next.question = patch.question ?? undefined;
    if (patch.tags !== undefined) next.tags = patch.tags;
    if (patch.highlights !== undefined) next.highlights = patch.highlights;
    if (patch.arabic_takeaway !== undefined) next.arabicTakeaway = patch.arabic_takeaway;
    setAnalysis(next);
    analysisCache.current.set(pageNumber, next);
    versionCache.current.set(analysisId, next);

    try {
      const res = await apiFetch<{ pageAnalysis: { id?: string; analysis: BackendAnalyzeResult; humanEdited?: boolean } }>(
        `/api/shwasha/analyses/${analysisId}`,
        { method: 'PATCH', body: JSON.stringify(patch) }
      );
      const confirmed = mapAnalysis(res.pageAnalysis.analysis, {
        id: res.pageAnalysis.id ?? analysisId,
        humanEdited: res.pageAnalysis.humanEdited ?? true,
      });
      if (confirmed) {
        setAnalysis(confirmed);
        analysisCache.current.set(pageNumber, confirmed);
        versionCache.current.set(analysisId, confirmed);
      }
    } catch (e) {
      setAnalysis(before);
      analysisCache.current.set(pageNumber, before);
      setError(e instanceof Error ? e.message : 'Edit failed');
    }
  };

  const handleSelectVersion = (analysisId: string) => {
    const cached = versionCache.current.get(analysisId);
    if (cached) {
      setAnalysis(cached);
      const isLatest = latestVersionIds.get(pageNumber) === analysisId;
      setViewingOlderVersion(!isLatest);
      if (isLatest) analysisCache.current.set(pageNumber, cached);
    }
  };

  // TAC mode actions.
  const runTacAnalysis = async (sectionIndexes?: [number, number, number]) => {
    if (!sessionId) return;
    setTacSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { sessionId };
      if (sectionIndexes) body.sectionIndexes = sectionIndexes;
      const res = await apiFetch<
        | { pageAnalysis: { id?: string; analysis: BackendAnalyzeResult; humanEdited?: boolean; pageNumber?: number } }
        | { ambiguous: true; candidates: Array<{ index: number; title: string; snippet: string }> }
      >('/api/shwasha/tac', { method: 'POST', body: JSON.stringify(body) });

      if ('ambiguous' in res && res.ambiguous) {
        setTacCandidates(res.candidates || []);
        return;
      }
      const pa = (res as { pageAnalysis: { id?: string; analysis: BackendAnalyzeResult; humanEdited?: boolean; pageNumber?: number } }).pageAnalysis;
      const mapped = mapAnalysis(pa.analysis, { id: pa.id, humanEdited: pa.humanEdited });
      if (mapped) {
        setAnalysis(mapped);
        const n = pa.pageNumber ?? 0;
        analysisCache.current.set(n, mapped);
        if (pa.id) {
          versionCache.current.set(pa.id, mapped);
          pageAnalysisIds.current.set(n, pa.id);
        }
      }
      setTacCandidates(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'TAC failed');
    } finally {
      setTacSubmitting(false);
    }
  };

  const highlights = useMemo(() => analysis?.highlights ?? [], [analysis]);
  const isApproved = approvedPages.has(pageNumber);
  const isTAC = readingMode === 'tac';
  const runningSynthesis = session?.runningSynthesis?.trim() || '';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-16">
        <Loader2 size={20} className="animate-spin text-on-surface-tertiary" />
      </div>
    );
  }

  if (!sessionId || error || !session) {
    return (
      <div className="max-w-lg mx-auto px-6 py-12 text-center space-y-4">
        <p className="text-sm text-on-surface-secondary">
          {error ?? (isRTL ? 'لم يتم العثور على الجلسة.' : 'Session not found.')}
        </p>
        <button
          onClick={() => router.push('/shwasha')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors"
        >
          <ArrowLeft size={14} />
          {isRTL ? 'رجوع إلى اختيار المصدر' : 'Back to source picker'}
        </button>
      </div>
    );
  }

  const modeMeta = MODE_LABEL[readingMode];

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border px-4 py-2.5 flex items-center gap-3 shrink-0 bg-surface flex-wrap">
        <button
          onClick={() => router.push('/shwasha')}
          className="inline-flex items-center gap-1.5 text-xs text-on-surface-secondary hover:text-on-surface"
        >
          <ArrowLeft size={14} className={isRTL ? 'rotate-180' : ''} />
          {isRTL ? 'تغيير المصدر' : 'Change source'}
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <p className="text-sm font-medium text-on-surface truncate" dir="auto">
            {session.title || (isRTL ? 'جلسة قراءة' : 'Reading session')}
          </p>
          <span
            className="text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 whitespace-nowrap"
            title={modeMeta.hint[isRTL ? 'ar' : 'en']}
          >
            {modeMeta[isRTL ? 'ar' : 'en']}
          </span>
          {/* J-12: Reading status toggle */}
          <button onClick={() => setStatusBarOpen(v => !v)}
            className="text-[11px] px-2 py-0.5 rounded-full border border-border text-on-surface-secondary hover:bg-surface-secondary whitespace-nowrap">
            {STATUS_LABELS[sessionReadingStatus][isRTL ? 'ar' : 'en']}
          </button>
        </div>
        {/* Status panel — shows below header when open */}
        {statusBarOpen && (
          <div className="w-full basis-full mt-2 border-t border-border pt-2 space-y-2">
            {/* Status buttons */}
            <div className="flex gap-1.5 flex-wrap">
              {(Object.entries(STATUS_LABELS) as [ReadingStatus, { en: string; ar: string }][]).map(([k, v]) => (
                <button key={k} onClick={() => updateStatus(k)}
                  className={cn('text-[11px] px-2.5 py-1 rounded-full border transition-colors',
                    sessionReadingStatus === k ? 'bg-accent/15 text-accent border-accent/30 font-medium' : 'border-border text-on-surface-tertiary hover:bg-surface-secondary'
                  )}>
                  {isRTL ? v.ar : v.en}
                </button>
              ))}
            </div>
            {/* Depth */}
            <div className="flex gap-1.5 flex-wrap">
              {(Object.entries(DEPTH_LABELS) as [ReadingDepth, { en: string; ar: string }][]).map(([k, v]) => (
                <button key={k} onClick={() => setSessionReadingDepth(k)}
                  className={cn('text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                    sessionReadingDepth === k ? 'bg-surface-tertiary text-on-surface border-accent/30' : 'border-border text-on-surface-tertiary hover:bg-surface-secondary'
                  )}>
                  {isRTL ? v.ar : v.en}
                </button>
              ))}
            </div>
            {/* Pause note */}
            {sessionReadingStatus === 'paused' && (
              <input value={pauseNote} onChange={e => setPauseNote(e.target.value)}
                placeholder={isRTL ? 'سبب الإيقاف...' : 'Why paused...'}
                className="w-full rounded border border-border bg-surface-secondary px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-accent"
                dir="auto"
              />
            )}
          </div>
        )}
        {isApproved && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-success/10 text-success">
            {isRTL ? 'معتمدة' : 'Approved'}
          </span>
        )}
        {savedToast && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-success/10 text-success">
            {savedToast}
          </span>
        )}
        {warningToast && (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-warning/10 text-warning">
            <AlertTriangle size={10} />
            {warningToast}
          </span>
        )}
      </header>

      {readingMode === 'rolling' && runningSynthesis && (
        <div className="border-b border-border bg-accent/5 shrink-0">
          <button
            onClick={() => setSynthesisOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-1.5 text-xs text-accent hover:bg-accent/10 transition-colors"
          >
            <span className="font-medium">
              {isRTL ? 'الخلاصة الجارية' : 'Running synthesis'}
            </span>
            {synthesisOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {synthesisOpen && (
            <div className="px-4 py-2 border-t border-accent/20">
              <p className="text-xs text-on-surface leading-relaxed whitespace-pre-wrap" dir="auto">
                {runningSynthesis}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        {isTAC ? (
          <TacView
            isRTL={isRTL}
            submitting={tacSubmitting}
            candidates={tacCandidates}
            selection={tacSelection}
            analysis={analysis}
            onSelectionChange={setTacSelection}
            onRun={() => runTacAnalysis()}
            onSubmitSelection={() => {
              const [a, b, c] = tacSelection;
              if (a === null || b === null || c === null) return;
              runTacAnalysis([a, b, c]);
            }}
            onEditAnalysis={handleEditAnalysis}
          />
        ) : (
          <>
            <div className="flex-1 min-h-0 md:basis-[65%] md:max-w-[65%] border-b md:border-b-0 md:border-e border-border">
              <PaperView
                page={page}
                pageNumber={pageNumber}
                totalPages={totalPages}
                highlights={highlights}
                onNext={() => goToPage(pageNumber + 1)}
                onPrev={() => goToPage(pageNumber - 1)}
                onJump={goToPage}
                onRequestImage={handleRequestImage}
                isRTL={isRTL}
              />
            </div>
            <div className="flex-1 min-h-0 md:basis-[35%] md:max-w-[35%] relative flex flex-col">
              <div className="shrink-0 flex items-center justify-end gap-1 px-3 py-1.5 border-b border-border bg-surface">
                <VersionHistory
                  sessionId={session.id}
                  pageNumber={pageNumber}
                  currentAnalysisId={analysis?.analysisId}
                  onSelect={handleSelectVersion}
                />
              </div>
              <div className="flex-1 min-h-0">
                <AnalysisPanel
                  analysis={analysis}
                  isStreaming={isStreaming}
                  streamProgress={streamProgress}
                  isRTL={isRTL}
                  viewingOlderVersion={viewingOlderVersion}
                  onApprove={handleApprove}
                  onRegenerate={handleRegenerate}
                  onAsk={handleAsk}
                  onSave={handleSave}
                  onRemoveTag={handleRemoveTag}
                  onEdit={viewingOlderVersion ? undefined : handleEditAnalysis}
                  footer={
                    <div className="space-y-3">
                      <RefineBar onSubmit={handleRefine} disabled={!analysis} isRTL={isRTL} />
                      <UserNotesPanel
                        sessionId={session.id}
                        pageNumber={pageNumber}
                        initialContent={session.userNotes?.[String(pageNumber)] || ''}
                        isRTL={isRTL}
                      />
                    </div>
                  }
                />
              </div>
              {chatOpen && (
                <div className="absolute inset-0 bg-surface flex flex-col border-s border-border z-10">
                  <div className="border-b border-border px-4 py-2.5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-accent" />
                      <p className="text-sm font-medium text-on-surface">
                        {isRTL ? `اسأل المُلخِّص — صفحة ${pageNumber}` : `Ask Al-Mulakhkhis — page ${pageNumber}`}
                      </p>
                    </div>
                    <button
                      onClick={() => setChatOpen(false)}
                      className="p-1 text-on-surface-tertiary hover:text-on-surface rounded"
                      aria-label="Close chat"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-auto p-3 space-y-3">
                    {chatMessages.length === 0 && (
                      <div className="text-center py-6 text-xs text-on-surface-tertiary" dir="auto">
                        {isRTL
                          ? 'اسأل المُلخِّص أي شي عن هالصفحة: المنهجية، الأدلة، الرأي بالنتائج، أو قارنها مع ورقة ثانية.'
                          : 'Ask Al-Mulakhkhis anything about this page: methodology, evidence, her take on the findings, or compare it to another paper.'}
                      </div>
                    )}
                    {chatMessages.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          'max-w-[90%] rounded-[var(--radius-lg)] px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                          m.role === 'user'
                            ? 'ms-auto bg-accent/10 text-on-surface'
                            : 'me-auto bg-surface-secondary text-on-surface'
                        )}
                        dir="auto"
                      >
                        {m.text || (m.role === 'assistant' && chatStreaming ? '…' : '')}
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>

                  <div className="border-t border-border px-3 py-2 shrink-0 flex gap-2">
                    <textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleChatSubmit();
                        }
                      }}
                      rows={1}
                      dir="auto"
                      disabled={chatStreaming}
                      placeholder={isRTL ? 'اكتب سؤالك…' : 'Type your question…'}
                      className="flex-1 px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                    <button
                      onClick={handleChatSubmit}
                      disabled={!chatInput.trim() || chatStreaming}
                      className="inline-flex items-center justify-center px-3 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
                    >
                      {chatStreaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="border-t border-error/30 bg-error/10 text-error text-xs px-4 py-2 shrink-0">
          {error}
        </div>
      )}
    </div>
  );
}

interface TacViewProps {
  isRTL: boolean;
  submitting: boolean;
  candidates: Array<{ index: number; title: string; snippet: string }> | null;
  selection: [number | null, number | null, number | null];
  analysis: AnalysisData | null;
  onSelectionChange: (next: [number | null, number | null, number | null]) => void;
  onRun: () => void;
  onSubmitSelection: () => void;
  onEditAnalysis: (patch: AnalysisEditPatch) => void;
}

function TacView({
  isRTL,
  submitting,
  candidates,
  selection,
  analysis,
  onSelectionChange,
  onRun,
  onSubmitSelection,
  onEditAnalysis,
}: TacViewProps) {
  if (analysis) {
    return (
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-h-0">
          <AnalysisPanel
            analysis={analysis}
            isStreaming={false}
            isRTL={isRTL}
            onEdit={onEditAnalysis}
          />
        </div>
      </div>
    );
  }

  if (candidates && candidates.length > 0) {
    const labels: Array<{ en: string; ar: string }> = [
      { en: 'Title', ar: 'العنوان' },
      { en: 'Abstract', ar: 'المقدمة' },
      { en: 'Conclusion', ar: 'الخاتمة' },
    ];
    const canSubmit = selection.every((v) => v !== null);
    return (
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-base font-semibold text-on-surface mb-1">
            {isRTL ? 'اختيار أقسام التصفح السريع' : 'Pick TAC sections'}
          </h2>
          <p className="text-sm text-on-surface-secondary mb-4">
            {isRTL
              ? 'لم نتمكن من تحديد أقسام الورقة تلقائيًا. اختر العنوان والمقدمة والخاتمة يدويًا.'
              : 'We could not identify the sections automatically. Pick Title, Abstract and Conclusion manually.'}
          </p>
          <div className="space-y-3">
            {labels.map((label, slot) => (
              <div key={slot}>
                <label className="text-xs font-medium text-on-surface-secondary block mb-1">
                  {isRTL ? label.ar : label.en}
                </label>
                <select
                  value={selection[slot] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
                    const next = [...selection] as [number | null, number | null, number | null];
                    next[slot] = v;
                    onSelectionChange(next);
                  }}
                  className="w-full px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">
                    {isRTL ? '— اختر قسمًا —' : '— pick a section —'}
                  </option>
                  {candidates.map((c) => (
                    <option key={c.index} value={c.index}>
                      #{c.index} — {c.title}
                    </option>
                  ))}
                </select>
                {selection[slot] !== null && (
                  <p className="text-[11px] text-on-surface-tertiary mt-1 line-clamp-2" dir="auto">
                    {candidates.find((c) => c.index === selection[slot])?.snippet}
                  </p>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={onSubmitSelection}
            disabled={!canSubmit || submitting}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {isRTL ? 'تشغيل التصفح السريع' : 'Run TAC analysis'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3">
        <h2 className="text-base font-semibold text-on-surface">
          {isRTL ? 'تصفح سريع — TAC' : 'Skim mode — TAC'}
        </h2>
        <p className="text-sm text-on-surface-secondary">
          {isRTL
            ? 'يعتمد هذا الوضع على العنوان والمقدمة والخاتمة فقط لإعطائك خلاصة سريعة للورقة.'
            : 'This mode reads only the title, abstract and conclusion to give you a quick digest of the paper.'}
        </p>
        <button
          onClick={onRun}
          disabled={submitting}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          {isRTL ? 'تشغيل التصفح السريع' : 'Run TAC analysis'}
        </button>
      </div>
    </div>
  );
}
