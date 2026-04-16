'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Play,
  Copy,
  Check,
  Upload,
  Film,
  Monitor,
  Square,
  Clock,
  Sparkles,
  Loader2,
  X,
  Image as ImageIcon,
  FileVideo,
  Download,
  Eye,
  RefreshCw,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  GripVertical,
  ArrowLeft,
  CheckCircle2,
  Pencil,
  Save,
  FolderOpen,
  Archive,
  Settings as SettingsIcon,
  Scissors,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiStream, apiFetch, API_BASE_URL } from '@/lib/api';
import { ItemMenu, ShowArchivedToggle } from '@/components/ui/item-menu';
import { AudioPlanEditor, type AudioPlan } from './audio-plan-editor';
import { CreativeIntakeForm } from './creative-intake-form';

// ─── Types ───

interface StudioMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface Scene {
  id: string;
  number: number;
  startTime: number;
  endTime: number;
  description: string;
  textOnScreen: string;
  transition: 'fade' | 'slide' | 'zoom' | 'cut' | 'none';
  colors: string;
  notes: string;
}

interface RenderMeta {
  id: string;
  filename: string;
  format: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  renderedAt: string;
  renderDurationMs: number;
  sizeBytes: number;
  archived?: boolean;
}

interface StudioProject {
  id: string;
  title: string;
  updatedAt: string;
  agentId?: string;
  studioProject?: {
    storyboard?: Scene[];
    code?: string;
    format?: string;
    duration?: number;
    archived?: boolean;
  };
}

interface StudioAsset {
  filename: string;
  url: string;
  type: 'image' | 'video';
  size: number;
}

type VideoFormat = 'reel' | 'landscape' | 'square';
type VideoDuration = 5 | 15 | 30 | 60;
type StudioStage = 'discussion' | 'storyboard' | 'render';

const FORMAT_OPTIONS: { id: VideoFormat; label: { en: string; ar: string }; size: string; w: number; h: number }[] = [
  { id: 'reel', label: { en: 'Reel', ar: 'ريل' }, size: '1080x1920', w: 1080, h: 1920 },
  { id: 'landscape', label: { en: 'Landscape', ar: 'افقي' }, size: '1920x1080', w: 1920, h: 1080 },
  { id: 'square', label: { en: 'Square', ar: 'مربع' }, size: '1080x1080', w: 1080, h: 1080 },
];

const DURATION_OPTIONS: VideoDuration[] = [5, 15, 30, 60];

const TRANSITION_OPTIONS: Scene['transition'][] = ['fade', 'slide', 'zoom', 'cut', 'none'];

// ─── Storyboard Parser ───

function parseStoryboard(content: string): Scene[] {
  const scenes: Scene[] = [];
  const sceneBlocks = content.split(/(?=(?:#{1,3}\s*)?(?:المشهد|مشهد|scene)\s*\d+)/i);

  for (const block of sceneBlocks) {
    const numMatch = block.match(/(?:المشهد|مشهد|scene)\s*(\d+)/i);
    if (!numMatch) continue;

    const number = parseInt(numMatch[1]);
    const timeMatch = block.match(/\((\d+)\s*[-–]\s*(\d+)\s*(?:ثانية|s|sec)?\)/i);
    const startTime = timeMatch ? parseInt(timeMatch[1]) : (number - 1) * 3;
    const endTime = timeMatch ? parseInt(timeMatch[2]) : number * 3;

    const descMatch = block.match(/(?:الوصف|description|وصف)[:\s]*([^\n]+)/i);
    const textMatch = block.match(/(?:النص المعروض|النص|text on screen|text)[:\s]*([^\n]+)/i);
    const transMatch = block.match(/(?:الانتقال|transition|انتقال)[:\s]*([^\n]+)/i);
    const colorMatch = block.match(/(?:الألوان|colors|ألوان|لون)[:\s]*([^\n]+)/i);
    const notesMatch = block.match(/(?:ملاحظات|notes|ملاحظة)[:\s]*([^\n]+)/i);
    const descBullet = block.match(/-\s*(?:الوصف|description)[:\s]*([^\n]+)/i);
    const textBullet = block.match(/-\s*(?:النص المعروض|النص|text)[:\s]*([^\n]+)/i);
    const transBullet = block.match(/-\s*(?:الانتقال|transition)[:\s]*([^\n]+)/i);
    const colorBullet = block.match(/-\s*(?:الألوان|colors)[:\s]*([^\n]+)/i);
    const notesBullet = block.match(/-\s*(?:ملاحظات|notes)[:\s]*([^\n]+)/i);

    const rawTransition = (transMatch?.[1] || transBullet?.[1] || 'cut').trim().toLowerCase();
    let transition: Scene['transition'] = 'cut';
    if (rawTransition.includes('fade')) transition = 'fade';
    else if (rawTransition.includes('slide')) transition = 'slide';
    else if (rawTransition.includes('zoom')) transition = 'zoom';
    else if (rawTransition.includes('none')) transition = 'none';

    scenes.push({
      id: crypto.randomUUID(),
      number,
      startTime,
      endTime,
      description: (descMatch?.[1] || descBullet?.[1] || block.slice(0, 120)).trim(),
      textOnScreen: (textMatch?.[1] || textBullet?.[1] || '').trim(),
      transition,
      colors: (colorMatch?.[1] || colorBullet?.[1] || '').trim(),
      notes: (notesMatch?.[1] || notesBullet?.[1] || '').trim(),
    });
  }

  return scenes;
}

// ─── Storyboard to Prompt ───

function storyboardToPrompt(scenes: Scene[], formatSize: string, totalDuration: number): string {
  let prompt = `اكتب كود Remotion كامل وجاهز للتشغيل بناءً على الستوري بورد التالي بالضبط.

## الإعدادات
- الأبعاد: ${formatSize}
- المدة الكلية: ${totalDuration} ثانية
- FPS: 30
- عدد الفريمات: ${totalDuration * 30}

## الستوري بورد المعتمد

`;

  for (const scene of scenes) {
    prompt += `### المشهد ${scene.number} (${scene.startTime}-${scene.endTime} ثانية)
- الوصف: ${scene.description}
- النص المعروض: ${scene.textOnScreen || 'لا يوجد'}
- الانتقال: ${scene.transition}
- الألوان: ${scene.colors || 'حسب اختيارك'}
- ملاحظات: ${scene.notes || 'لا يوجد'}

`;
  }

  prompt += `## تعليمات مهمة (مستوى مهني)
- اكتب كود TypeScript كامل (120-200 سطر) في بلوك كود واحد
- استخدم spring() و interpolate() بكثرة — حركة متعددة الطبقات
- ادعم RTL للنصوص العربية: direction: 'rtl', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif'
- صدّر المكون الرئيسي كـ export default
- كل مشهد يجب أن يطابق التوقيت المحدد بالضبط (لا تضف/تحذف مشاهد)

## استخدم الأدوات المتقدمة (مو فقط divs):
- **@remotion/transitions** — TransitionSeries + fade/slide/wipe/flip بين المشاهد
- **@remotion/shapes** — Circle, Rect, Star, Triangle (استبدل divs المربعة)
- **@remotion/paths** — evolvePath لكتابة نصوص باليد
- **@remotion/noise** — noise2D للحركة العضوية (غيوم، موجات، جزيئات)
- **Array.from({length: 15-40})** لتوليد جزيئات/نجوم/bars موجية
- **SVG** لرسم أشكال معقّدة (crosshairs, orbits, waveforms, elevation profiles)
- **box-shadow + radial-gradient + linear-gradient** بوفرة
- **backdrop-filter: blur(...)** للبطاقات الزجاجية

## الأصول المتاحة:
- \`import { AL_HAMRA_TOWER } from '../../assets/al-hamra-tower'\` — صورة برج حقيقي
- \`import { KUWAIT_MAP_DATA } from '../../assets/kuwait-map-data'\` — خريطة كويت OSM
- Mapbox URL بـ \`__MAPBOX_TOKEN__\` placeholder (يُستبدل سيرفر-سايد)
- Geoapify بـ \`__GEOAPIFY_KEY__\`
- Thunderforest بـ \`__THUNDERFOREST_KEY__\`

## مستوى الجودة المطلوب:
استوحِ من demos المشروع: DemoMapbox (zoom سينمائي 3 طبقات)، DemoElevenLabs (waveform + particles)، DemoStableAudio (4 حلقات spectrum + notes). هذا مستوى "مهني"، مو "حر بسيط".`;

  return prompt;
}

// ─── Code Block Extractor ───

function extractCodeBlocks(content: string): string[] {
  const blocks: string[] = [];
  // Match any code block: ```tsx, ```typescript, ```jsx, ```remotion, ``` (no lang), etc.
  const regex = /```[a-zA-Z]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const code = match[1].trim();
    // Only include if it looks like Remotion/React code
    if (code.includes('import') || code.includes('export') || code.includes('const') || code.includes('function')) {
      blocks.push(code);
    }
  }
  // Fallback: if no code blocks found but content has Remotion imports, treat the whole thing as code
  if (blocks.length === 0 && (content.includes('from "remotion"') || content.includes("from 'remotion'"))) {
    // Find the code section starting from the first import
    const importIdx = content.indexOf('import');
    if (importIdx !== -1) {
      const codeSection = content.slice(importIdx).replace(/```/g, '').trim();
      if (codeSection.length > 50) blocks.push(codeSection);
    }
  }
  // Deduplicate identical code blocks
  return [...new Set(blocks)];
}

// ─── Strip fenced code blocks from markdown content (used in render-stage chat
// to avoid rendering the code twice — once in chat, once in right panel) ───
function stripCodeBlocks(content: string): string {
  // Remove fenced code blocks entirely; leave a short placeholder so the
  // surrounding prose still reads naturally.
  let stripped = content.replace(/```[a-zA-Z]*\n[\s\S]*?```/g, '').trim();
  // Collapse excessive blank lines left behind
  stripped = stripped.replace(/\n{3,}/g, '\n\n');
  return stripped;
}

// ─── Format bytes ───
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Component ───

export function StudioPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  // Stage management
  const [stage, setStage] = useState<StudioStage>('discussion');

  // Chat state
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [convId, setConvId] = useState<string | null>(null);

  // Settings
  const [format, setFormat] = useState<VideoFormat>('reel');
  const [duration, setDuration] = useState<VideoDuration>(30);
  const [skipIntake, setSkipIntake] = useState(false);

  // Storyboard state
  const [scenes, setScenes] = useState<Scene[]>([]);

  // Code / Render state
  const [codeBlocks, setCodeBlocks] = useState<string[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderResult, setRenderResult] = useState<{ filename: string; downloadUrl: string; durationMs: number } | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  // Export options (format + trim + audio)
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [outputFormat, setOutputFormat] = useState<'mp4' | 'gif' | 'webm'>('mp4');
  const [trimEnabled, setTrimEnabled] = useState(false);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(duration);
  const [audioPlan, setAudioPlan] = useState<AudioPlan>({ enabled: false, backend: 'elevenlabs', segments: [] });
  // Post-render scene editing
  const [editingSceneIdx, setEditingSceneIdx] = useState<number | null>(null);
  const [sceneEditRequest, setSceneEditRequest] = useState('');
  // Per-render cost tier override (defaults to global tier from Settings)
  const [costTier, setCostTier] = useState<'zero-cost' | 'saving' | 'medium' | 'max'>('saving');
  const [estCost, setEstCost] = useState<{ totalUSD: number; lines: Array<{ service: string; usd: number }> } | null>(null);
  useEffect(() => {
    apiFetch<{ tier: typeof costTier }>('/api/settings/cost-tier').then((r) => setCostTier(r.tier)).catch(() => {});
  }, []);
  // Keep trim range bounded by duration when duration changes
  useEffect(() => {
    setTrimEnd((e) => Math.min(e, duration));
    setTrimStart((s) => Math.min(s, Math.max(0, duration - 0.1)));
  }, [duration]);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Gallery
  const [gallery, setGallery] = useState<RenderMeta[]>([]);
  const [showGallery, setShowGallery] = useState(false);

  // Projects panel
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [showProjects, setShowProjects] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [savingProject, setSavingProject] = useState(false);

  // Assets panel
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [copiedAsset, setCopiedAsset] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  // Gallery archived toggle
  const [showArchivedGallery, setShowArchivedGallery] = useState(false);

  // Load gallery
  const loadGallery = useCallback(async () => {
    try {
      const data = await apiFetch<RenderMeta[]>(`/api/renders?archived=${showArchivedGallery}`);
      setGallery(data);
    } catch { /* ignore */ }
  }, [showArchivedGallery]);

  // Load projects (studio conversations)
  const loadProjects = useCallback(async () => {
    try {
      const convs = await apiFetch<StudioProject[]>('/api/conversations');
      const studioConvs = convs.filter((c) => c.agentId === 'creative');
      setProjects(studioConvs);
    } catch { /* ignore */ }
  }, []);

  // Load assets
  const loadAssets = useCallback(async () => {
    try {
      const data = await apiFetch<StudioAsset[]>('/api/studio/assets');
      setAssets(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadGallery();
    loadProjects();
    loadAssets();
  }, [loadGallery, loadProjects, loadAssets]);

  // ─── Save project ───
  const handleSaveProject = async () => {
    if (!convId) return;
    setSavingProject(true);
    try {
      const formatInfo = FORMAT_OPTIONS.find((f) => f.id === format);
      await apiFetch(`/api/conversations/${convId}/studio`, {
        method: 'PUT',
        body: JSON.stringify({
          storyboard: scenes.length > 0 ? scenes : undefined,
          code: codeBlocks.length > 0 ? codeBlocks.join('\n\n') : undefined,
          format: formatInfo?.size,
          duration,
        }),
      });
      loadProjects();
    } catch { /* ignore */ }
    setSavingProject(false);
  };

  // ─── Archive project ───
  const handleArchiveProject = async (projectId: string) => {
    try {
      await apiFetch(`/api/conversations/${projectId}/archive`, { method: 'PUT' });
      loadProjects();
    } catch { /* ignore */ }
  };

  // ─── Resume project ───
  const handleResumeProject = async (project: StudioProject) => {
    setConvId(project.id);
    // Load messages
    try {
      const msgs = await apiFetch<Array<{ id: string; role: string; content: string }>>(`/api/conversations/${project.id}/messages`);
      setMessages(msgs.map((m) => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content })));
    } catch { /* ignore */ }
    // Restore studio project data
    if (project.studioProject) {
      if (project.studioProject.storyboard && project.studioProject.storyboard.length > 0) {
        setScenes(project.studioProject.storyboard as Scene[]);
        setStage('storyboard');
      }
      if (project.studioProject.code) {
        setCodeBlocks([project.studioProject.code]);
        setStage('render');
      }
      if (project.studioProject.duration) {
        setDuration(project.studioProject.duration as VideoDuration);
      }
    }
    setShowProjects(false);
  };

  // ─── Upload asset ───
  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        await fetch(`${API_BASE_URL}/api/studio/upload`, { method: 'POST', body: formData });
      } catch { /* ignore */ }
    }
    loadAssets();
    if (assetInputRef.current) assetInputRef.current.value = '';
  };

  // ─── Delete asset ───
  const handleDeleteAsset = async (filename: string) => {
    try {
      await apiFetch(`/api/studio/assets/${filename}`, { method: 'DELETE' });
      loadAssets();
    } catch { /* ignore */ }
  };

  // ─── Copy asset path ───
  const handleCopyAssetPath = (filename: string) => {
    navigator.clipboard.writeText(`${API_BASE_URL}/api/studio/assets/${filename}`);
    setCopiedAsset(filename);
    setTimeout(() => setCopiedAsset(null), 2000);
  };

  // ─── Send message ───
  const sendMessage = useCallback((text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMsg: StudioMessage = { id: crypto.randomUUID(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);
    setStreamingContent('');
    let collected = '';

    const formatInfo = FORMAT_OPTIONS.find((f) => f.id === format);

    const cancel = apiStream(
      '/api/chat',
      {
        message: text,
        conversationId: convId,
        agentId: 'creative',
        model: 'claude-sonnet-4-6',
        context: `[إعدادات الفيديو — التزم بها بالضبط]\nالحجم: ${formatInfo?.size || '1080x1920'} (${formatInfo?.label.ar || 'ريل'})\nالمدة: ${duration} ثانية فقط — لا تتجاوزها\nFPS: 30\nعدد الفريمات: ${duration * 30}\n\n[قاعدة صارمة]\n${stage === 'discussion' ? 'أنت في مرحلة المناقشة والستوري بورد. لا تكتب كود Remotion أبداً في هذه المرحلة. ناقش الفكرة واكتب ستوري بورد فقط بالتنسيق المحدد.' : 'أنت في مرحلة كتابة الكود. اكتب كود Remotion كامل بناءً على الستوري بورد المعتمد.'}\n\nتنسيق الستوري بورد:\n### المشهد 1 (0-X ثانية)\n- الوصف: ...\n- النص المعروض: ...\n- الانتقال: fade/slide/zoom/cut\n- الألوان: ...\n- ملاحظات: ...`,
      },
      (event, data) => {
        const d = data as Record<string, unknown>;
        if (event === 'text') {
          const chunk = d.content as string;
          collected += chunk;
          setStreamingContent(collected);
        } else if (event === 'conversation') {
          setConvId(d.conversationId as string);
        }
      },
      () => {
        if (collected) {
          const assistantMsg: StudioMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: collected,
          };
          setMessages((msgs) => [...msgs, assistantMsg]);
        }
        setStreamingContent('');
        setIsStreaming(false);
        collected = '';
      },
      (err) => {
        console.error('Studio stream error:', err);
        setIsStreaming(false);
        setStreamingContent('');
      }
    );

    cancelRef.current = cancel;
  }, [isStreaming, convId, format, duration, stage]);

  const handleSend = useCallback(() => {
    sendMessage(input.trim());
  }, [input, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── Generate storyboard ───
  const handleGenerateStoryboard = () => {
    const formatInfo = FORMAT_OPTIONS.find((f) => f.id === format);
    const prompt = isRTL
      ? `اكتب ستوري بورد مفصل لفيديو ${formatInfo?.label.ar} (${formatInfo?.size}) مدته ${duration} ثانية. لكل مشهد اكتب: الوصف، النص المعروض، الانتقال، الألوان، ملاحظات.`
      : `Write a detailed storyboard for a ${formatInfo?.label.en} video (${formatInfo?.size}), ${duration}s duration. For each scene include: description, text on screen, transition, colors, notes.`;
    sendMessage(prompt);
  };

  const handleParseStoryboard = () => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return;
    const parsed = parseStoryboard(lastAssistant.content);
    if (parsed.length > 0) {
      setScenes(parsed);
      setStage('storyboard');
    }
  };

  const latestHasStoryboard = (() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return false;
    return parseStoryboard(lastAssistant.content).length > 0;
  })();

  // ─── Storyboard editing ───
  const updateScene = (id: string, field: keyof Scene, value: string | number) => {
    setScenes((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const deleteScene = (id: string) => {
    setScenes((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      return filtered.map((s, i) => ({ ...s, number: i + 1 }));
    });
  };

  const moveScene = (id: string, direction: 'up' | 'down') => {
    setScenes((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      if (direction === 'up' && idx === 0) return prev;
      if (direction === 'down' && idx === prev.length - 1) return prev;
      const next = [...prev];
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((s, i) => ({ ...s, number: i + 1 }));
    });
  };

  const addScene = () => {
    const lastScene = scenes[scenes.length - 1];
    const newStart = lastScene ? lastScene.endTime : 0;
    const newEnd = newStart + 3;
    setScenes((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        number: prev.length + 1,
        startTime: newStart,
        endTime: newEnd,
        description: '',
        textOnScreen: '',
        transition: 'fade',
        colors: '',
        notes: '',
      },
    ]);
  };

  const totalStoryboardDuration = scenes.length > 0
    ? Math.max(...scenes.map((s) => s.endTime))
    : 0;

  // ─── Approve storyboard ───
  const handleApproveStoryboard = () => {
    const formatInfo = FORMAT_OPTIONS.find((f) => f.id === format);
    const prompt = storyboardToPrompt(scenes, formatInfo?.size || '1080x1920', duration);
    setStage('render');
    sendMessage(prompt);
  };

  // ─── Extract code from assistant response ───
  useEffect(() => {
    if (stage === 'render') {
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      if (lastAssistant) {
        const codes = extractCodeBlocks(lastAssistant.content);
        if (codes.length > 0) {
          setCodeBlocks(codes);
          setRenderResult(null);
          setRenderError(null);
          setPreviewImage(null);
        }
      }
    }
  }, [messages, stage]);

  // ─── Copy code ───
  const handleCopyCode = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleCopyAll = () => {
    const allCode = codeBlocks.join('\n\n// ───────────────────\n\n');
    navigator.clipboard.writeText(allCode);
    setCopiedIdx(-1);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  // ─── Render Video ───
  const handleRenderVideo = async () => {
    if (codeBlocks.length === 0 || isRendering) return;

    const code = codeBlocks.join('\n\n');
    const formatInfo = FORMAT_OPTIONS.find((f) => f.id === format);

    setIsRendering(true);
    setRenderError(null);
    setRenderResult(null);

    try {
      // API returns jobId — poll for completion
      const fps = 30;
      const body: Record<string, unknown> = {
        code,
        width: formatInfo?.w || 1080,
        height: formatInfo?.h || 1920,
        fps,
        duration,
        format: outputFormat,
      };
      if (trimEnabled) {
        body.startFrame = Math.max(0, Math.round(trimStart * fps));
        body.endFrame   = Math.min(duration * fps - 1, Math.round(trimEnd * fps));
      }
      if (audioPlan.enabled && audioPlan.segments.length > 0) {
        body.audioPlan = audioPlan;
      }
      const startResult = await apiFetch<{ ok: boolean; jobId?: string; error?: string }>('/api/render', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!startResult.ok || !startResult.jobId) {
        setRenderError(startResult.error || 'Failed to start render');
        setIsRendering(false);
        return;
      }

      // Poll for completion
      const jobId = startResult.jobId;
      const poll = async (): Promise<void> => {
        const job = await apiFetch<{ status: string; progress: number; filename?: string; downloadUrl?: string; durationMs?: number; error?: string }>(`/api/render/${jobId}`);
        if (job.status === 'complete' && job.filename) {
          setRenderResult({ filename: job.filename, downloadUrl: job.downloadUrl!, durationMs: job.durationMs || 0 });
          setIsRendering(false);
        } else if (job.status === 'failed') {
          setRenderError(job.error || 'Render failed');
          setIsRendering(false);
        } else {
          // Still rendering — poll again
          await new Promise(r => setTimeout(r, 2000));
          return poll();
        }
      };
      await poll();

      loadGallery();
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : 'Render failed');
      setIsRendering(false);
    }
  };

  // ─── Quick Preview ───
  const handleQuickPreview = async () => {
    if (codeBlocks.length === 0 || isPreviewing) return;

    const code = codeBlocks.join('\n\n');
    const formatInfo = FORMAT_OPTIONS.find((f) => f.id === format);

    setIsPreviewing(true);
    setPreviewImage(null);

    try {
      const result = await apiFetch<{
        ok: boolean;
        imageBase64: string;
        error?: string;
      }>('/api/render/preview', {
        method: 'POST',
        body: JSON.stringify({
          code,
          width: formatInfo?.w || 1080,
          height: formatInfo?.h || 1920,
          fps: 30,
          duration,
        }),
      });

      if (result.ok) {
        setPreviewImage(result.imageBase64);
      }
    } catch (err) {
      console.error('Preview error:', err);
    } finally {
      setIsPreviewing(false);
    }
  };

  // ─── Go back ───
  const handleGoBack = () => {
    if (stage === 'storyboard') setStage('discussion');
    else if (stage === 'render') setStage('storyboard');
  };

  const stageLabels = {
    discussion: { en: 'Discussion', ar: 'مناقشة' },
    storyboard: { en: 'Storyboard', ar: 'ستوري بورد' },
    render: { en: 'Render', ar: 'تصدير' },
  };

  const stageNumbers: StudioStage[] = ['discussion', 'storyboard', 'render'];

  // ─── Markdown renderer ───
  const renderMarkdown = (content: string) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ children }) => (
          <pre className="bg-[#1e1e2e] text-[#cdd6f4] rounded-lg p-4 overflow-x-auto text-xs my-2">
            {children}
          </pre>
        ),
        code: ({ children, className }) => {
          const isInline = !className;
          return isInline ? (
            <code className="bg-surface-tertiary px-1.5 py-0.5 rounded text-xs">
              {children}
            </code>
          ) : (
            <code className={className}>{children}</code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );

  // Filter projects
  const filteredProjects = showArchived
    ? projects
    : projects.filter((p) => !p.studioProject?.archived);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-14 border-b border-border bg-surface shrink-0">
        <div className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center text-white font-bold text-sm">
          {isRTL ? 'ك' : 'C'}
        </div>
        <div>
          <h1 className="text-sm font-semibold text-on-surface">
            {isRTL ? 'استوديو الكرييتف' : 'Creative Studio'}
          </h1>
          <p className="text-[11px] text-on-surface-tertiary">
            {isRTL ? 'صناعة الفيديو بالـ Remotion' : 'Video creation with Remotion'}
          </p>
        </div>

        {/* Stage Indicator */}
        <div className="flex items-center gap-1 mx-auto">
          {stageNumbers.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <button
                onClick={() => {
                  const currentIdx = stageNumbers.indexOf(stage);
                  if (i < currentIdx) setStage(s);
                }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-colors',
                  stage === s
                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 font-medium'
                    : stageNumbers.indexOf(stage) > i
                      ? 'text-on-surface-secondary cursor-pointer hover:bg-surface-secondary'
                      : 'text-on-surface-tertiary/50'
                )}
              >
                <span className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                  stage === s
                    ? 'bg-rose-500 text-white'
                    : stageNumbers.indexOf(stage) > i
                      ? 'bg-emerald-500 text-white'
                      : 'bg-surface-tertiary text-on-surface-tertiary'
                )}>
                  {stageNumbers.indexOf(stage) > i ? <Check size={10} /> : i + 1}
                </span>
                {stageLabels[s][language]}
              </button>
              {i < stageNumbers.length - 1 && (
                <div className={cn(
                  'w-6 h-px',
                  stageNumbers.indexOf(stage) > i ? 'bg-emerald-500' : 'bg-border'
                )} />
              )}
            </div>
          ))}
        </div>

        <div className="flex-1" />

        {/* Save Project */}
        {convId && (
          <button
            onClick={handleSaveProject}
            disabled={savingProject}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-on-surface-secondary hover:bg-surface-secondary border border-border transition-colors disabled:opacity-50"
          >
            {savingProject ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isRTL ? 'حفظ المشروع' : 'Save Project'}
          </button>
        )}

        {/* Projects */}
        <button
          onClick={() => { setShowProjects(!showProjects); if (!showProjects) loadProjects(); }}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors',
            showProjects
              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 font-medium'
              : 'text-on-surface-tertiary hover:bg-surface-secondary'
          )}
        >
          <FolderOpen size={14} />
          {isRTL ? 'المشاريع' : 'Projects'}
          {projects.length > 0 && (
            <span className="bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] px-1.5 py-0.5 rounded-full">
              {projects.length}
            </span>
          )}
        </button>

        <button
          onClick={() => { setShowGallery(!showGallery); if (!showGallery) loadGallery(); }}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors',
            showGallery
              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 font-medium'
              : 'text-on-surface-tertiary hover:bg-surface-secondary'
          )}
        >
          <Film size={14} />
          {isRTL ? 'المعرض' : 'Gallery'}
          {gallery.length > 0 && (
            <span className="bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] px-1.5 py-0.5 rounded-full">
              {gallery.length}
            </span>
          )}
        </button>
      </div>

      {/* Projects Panel */}
      {showProjects && (
        <div className="border-b border-border bg-surface-secondary px-6 py-4 max-h-64 overflow-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wider">
              {isRTL ? 'مشاريع الاستوديو' : 'Studio Projects'}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowArchived(!showArchived)}
                className={cn('text-[10px] px-2 py-0.5 rounded transition-colors',
                  showArchived ? 'bg-surface-tertiary text-on-surface-secondary' : 'text-on-surface-tertiary hover:text-on-surface-secondary'
                )}
              >
                {isRTL ? (showArchived ? 'اخف المؤرشف' : 'اعرض المؤرشف') : (showArchived ? 'Hide archived' : 'Show archived')}
              </button>
              <button onClick={() => setShowProjects(false)} className="text-on-surface-tertiary hover:text-on-surface">
                <X size={14} />
              </button>
            </div>
          </div>
          {filteredProjects.length === 0 ? (
            <p className="text-xs text-on-surface-tertiary text-center py-4">
              {isRTL ? 'لا توجد مشاريع بعد' : 'No projects yet'}
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  className={cn(
                    'rounded-lg border bg-surface p-3 cursor-pointer hover:border-rose-500/50 transition-colors group',
                    project.studioProject?.archived ? 'border-border opacity-60' : 'border-border'
                  )}
                  onClick={() => handleResumeProject(project)}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Film size={14} className="text-rose-500" />
                    <span className="text-xs font-medium text-on-surface truncate flex-1">{project.title}</span>
                  </div>
                  <div className="text-[10px] text-on-surface-tertiary space-y-0.5">
                    <p>{new Date(project.updatedAt).toLocaleDateString()}</p>
                    <p className="flex items-center gap-1">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded-full text-[9px]',
                        project.studioProject?.code
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : project.studioProject?.storyboard
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-surface-tertiary text-on-surface-tertiary'
                      )}>
                        {project.studioProject?.code
                          ? (isRTL ? 'جاهز' : 'Ready')
                          : project.studioProject?.storyboard
                            ? (isRTL ? 'ستوري بورد' : 'Storyboard')
                            : (isRTL ? 'مسودة' : 'Draft')}
                      </span>
                      {project.studioProject?.archived && (
                        <span className="px-1.5 py-0.5 rounded-full bg-surface-tertiary text-on-surface-tertiary text-[9px]">
                          {isRTL ? 'مؤرشف' : 'Archived'}
                        </span>
                      )}
                    </p>
                  </div>
                  {!project.studioProject?.archived && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleArchiveProject(project.id); }}
                      className="mt-2 flex items-center gap-1 text-[10px] text-on-surface-tertiary hover:text-on-surface-secondary opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Archive size={10} />
                      {isRTL ? 'ارشفة' : 'Archive'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Gallery Overlay */}
      {showGallery && (
        <div className="border-b border-border bg-surface-secondary px-6 py-4 max-h-64 overflow-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wider">
              {isRTL ? 'الفيديوهات المصدرة' : 'Rendered Videos'}
            </h3>
            <div className="flex items-center gap-3">
              <ShowArchivedToggle value={showArchivedGallery} onChange={setShowArchivedGallery} isRTL={isRTL} />
              <button onClick={() => setShowGallery(false)} className="text-on-surface-tertiary hover:text-on-surface">
                <X size={14} />
              </button>
            </div>
          </div>
          {gallery.length === 0 ? (
            <p className="text-xs text-on-surface-tertiary text-center py-4">
              {isRTL ? 'لا توجد فيديوهات مصدرة بعد' : 'No rendered videos yet'}
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {gallery.map((item) => (
                <div key={item.id} className={cn('rounded-lg border border-border bg-surface p-3', item.archived && 'opacity-60')}>
                  <div className="flex items-center gap-2 mb-2">
                    <FileVideo size={14} className="text-rose-500" />
                    <span className="text-xs font-mono text-on-surface truncate flex-1">{item.filename}</span>
                    <ItemMenu
                      isRTL={isRTL}
                      archived={!!item.archived}
                      onArchive={async () => {
                        await apiFetch(`/api/renders/${item.id}/archive`, { method: 'PUT', body: JSON.stringify({ archived: true }) });
                        await loadGallery();
                      }}
                      onUnarchive={async () => {
                        await apiFetch(`/api/renders/${item.id}/archive`, { method: 'PUT', body: JSON.stringify({ archived: false }) });
                        await loadGallery();
                      }}
                      onDelete={async () => {
                        await apiFetch(`/api/renders/${item.id}`, { method: 'DELETE' });
                        await loadGallery();
                      }}
                      deleteConfirmMessage={isRTL ? 'حذف هذا الفيديو؟' : 'Delete this video?'}
                    />
                  </div>
                  <div className="text-[10px] text-on-surface-tertiary space-y-0.5">
                    <p>{item.width}x{item.height} | {item.fps}fps | {item.durationInFrames} frames</p>
                    <p>{formatBytes(item.sizeBytes)} | {(item.renderDurationMs / 1000).toFixed(1)}s render</p>
                    <p>{new Date(item.renderedAt).toLocaleDateString()}</p>
                  </div>
                  <a
                    href={`${API_BASE_URL}/api/videos/${item.filename}`}
                    download
                    className="flex items-center justify-center gap-1 mt-2 px-2 py-1 rounded bg-surface-secondary hover:bg-surface-tertiary text-[10px] text-on-surface-secondary transition-colors"
                  >
                    <Download size={10} />
                    {isRTL ? 'تحميل' : 'Download'}
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">

        {/* ═══ STAGE 1: Discussion ═══ */}
        {stage === 'discussion' && (
          <div className="flex flex-col flex-1">
            <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
              {messages.length === 0 && !streamingContent && !skipIntake && (
                <div className="flex flex-col items-center justify-start pt-6 pb-2">
                  <CreativeIntakeForm
                    isRTL={isRTL}
                    defaultDuration={duration}
                    onSubmit={({ format: f, duration: d, prompt }) => {
                      setFormat(f);
                      setDuration(d as VideoDuration);
                      setSkipIntake(true);
                      // send on next tick so state updates propagate into sendMessage closure
                      setTimeout(() => sendMessage(prompt), 0);
                    }}
                    onSkip={() => setSkipIntake(true)}
                  />
                </div>
              )}

              {messages.length === 0 && !streamingContent && skipIntake && (
                <div className="flex flex-col items-center justify-center h-full text-center text-on-surface-tertiary">
                  <Film size={48} className="mb-4 opacity-30" />
                  <p className="text-lg font-medium mb-1">
                    {isRTL ? 'مرحبا بك في الاستوديو' : 'Welcome to the Studio'}
                  </p>
                  <p className="text-sm max-w-md mb-4">
                    {isRTL
                      ? 'ناقش فكرة فيديو مع الكرييتف. سيساعدك في تطوير الفكرة وبناء ستوري بورد.'
                      : 'Discuss a video idea with The Creative. It will help develop the idea and build a storyboard.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSkipIntake(false)}
                    className="text-xs text-rose-500 hover:text-rose-600 underline underline-offset-2"
                  >
                    {isRTL ? 'استخدم البدء السريع' : 'Use quick start'}
                  </button>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn('flex gap-3', msg.role === 'user' ? (isRTL ? 'flex-row-reverse' : '') : '')}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-lg bg-rose-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {isRTL ? 'ك' : 'C'}
                    </div>
                  )}
                  <div
                    className={cn(
                      'rounded-xl px-4 py-3 text-sm max-w-[85%]',
                      msg.role === 'user'
                        ? 'bg-accent text-on-accent ms-auto'
                        : 'bg-surface-secondary text-on-surface'
                    )}
                  >
                    {msg.role === 'assistant' ? renderMarkdown(msg.content) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {streamingContent && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-rose-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {isRTL ? 'ك' : 'C'}
                  </div>
                  <div className="rounded-xl px-4 py-3 text-sm bg-surface-secondary text-on-surface max-w-[85%]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Storyboard detected banner */}
            {latestHasStoryboard && !isStreaming && (
              <div className="mx-4 mb-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-3">
                <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                <p className="text-xs text-emerald-700 dark:text-emerald-400 flex-1">
                  {isRTL
                    ? 'تم اكتشاف ستوري بورد في الرد. يمكنك تعديله قبل توليد الكود.'
                    : 'Storyboard detected in response. You can edit it before generating code.'}
                </p>
                <button
                  onClick={handleParseStoryboard}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shrink-0"
                >
                  <Pencil size={14} />
                  {isRTL ? 'تعديل الستوري بورد' : 'Edit Storyboard'}
                </button>
              </div>
            )}

            {/* Input area */}
            <div className="border-t border-border px-4 py-3">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isRTL ? 'صف فكرة الفيديو...' : 'Describe your video idea...'}
                  rows={2}
                  className={cn(
                    'flex-1 resize-none rounded-xl px-4 py-3 text-sm',
                    'bg-surface-secondary text-on-surface placeholder:text-on-surface-tertiary',
                    'border border-border focus:border-accent focus:outline-none',
                    isRTL && 'text-right'
                  )}
                />
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={() => { cancelRef.current?.(); if (streamingContent.trim()) setMessages(m => [...m, {id: crypto.randomUUID(), role: 'assistant', content: streamingContent + '\n\n_(توقف)_'}]); setIsStreaming(false); setStreamingContent(''); }}
                    className="p-3 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                    title={isRTL ? 'إيقاف' : 'Stop'}
                  >
                    <Square size={16} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!input.trim()}
                    onClick={() => sendMessage(input)}
                    className={cn(
                      'p-3 rounded-xl transition-colors',
                      input.trim() ? 'bg-rose-500 text-white hover:bg-rose-600' : 'bg-surface-tertiary text-on-surface-tertiary'
                    )}
                  >
                    <Send size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ STAGE 2: Storyboard Editor ═══ */}
        {stage === 'storyboard' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-surface-secondary shrink-0">
              <button
                onClick={handleGoBack}
                className="flex items-center gap-1 text-xs text-on-surface-tertiary hover:text-on-surface transition-colors"
              >
                <ArrowLeft size={14} />
                {isRTL ? 'رجوع' : 'Back'}
              </button>
              <div className="flex-1" />
              <div className="flex items-center gap-2 text-xs text-on-surface-secondary">
                <Clock size={12} />
                <span>
                  {isRTL ? 'المدة الكلية:' : 'Total duration:'}{' '}
                  <strong className="text-on-surface">{totalStoryboardDuration}s</strong>
                </span>
                <span className="text-on-surface-tertiary">|</span>
                <span>
                  {scenes.length} {isRTL ? 'مشاهد' : 'scenes'}
                </span>
              </div>
              <div className="flex-1" />
              <button
                onClick={addScene}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-on-surface-secondary hover:bg-surface-tertiary border border-border transition-colors"
              >
                <Plus size={14} />
                {isRTL ? 'اضف مشهد' : 'Add Scene'}
              </button>
            </div>

            <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
              {scenes.map((scene) => (
                <div key={scene.id} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <GripVertical size={14} className="text-on-surface-tertiary" />
                    <span className="text-sm font-bold text-rose-500">
                      {isRTL ? `المشهد ${scene.number}` : `Scene ${scene.number}`}
                    </span>
                    <div className="flex items-center gap-1 ms-2">
                      <input
                        type="number"
                        min={0}
                        value={scene.startTime}
                        onChange={(e) => updateScene(scene.id, 'startTime', parseInt(e.target.value) || 0)}
                        className="w-12 px-1.5 py-0.5 rounded border border-border bg-surface-secondary text-xs text-center"
                      />
                      <span className="text-xs text-on-surface-tertiary">-</span>
                      <input
                        type="number"
                        min={0}
                        value={scene.endTime}
                        onChange={(e) => updateScene(scene.id, 'endTime', parseInt(e.target.value) || 0)}
                        className="w-12 px-1.5 py-0.5 rounded border border-border bg-surface-secondary text-xs text-center"
                      />
                      <span className="text-[10px] text-on-surface-tertiary">{isRTL ? 'ث' : 's'}</span>
                    </div>
                    <div className="flex-1" />
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveScene(scene.id, 'up')} className="p-1 rounded hover:bg-surface-secondary text-on-surface-tertiary hover:text-on-surface transition-colors"><ChevronUp size={14} /></button>
                      <button onClick={() => moveScene(scene.id, 'down')} className="p-1 rounded hover:bg-surface-secondary text-on-surface-tertiary hover:text-on-surface transition-colors"><ChevronDown size={14} /></button>
                      <button onClick={() => deleteScene(scene.id)} className="p-1 rounded hover:bg-red-500/10 text-on-surface-tertiary hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-[10px] font-medium text-on-surface-tertiary uppercase tracking-wider mb-1 block">{isRTL ? 'الوصف' : 'Description'}</label>
                      <textarea value={scene.description} onChange={(e) => updateScene(scene.id, 'description', e.target.value)} rows={2} className={cn('w-full resize-none rounded-lg px-3 py-2 text-xs bg-surface-secondary text-on-surface border border-border focus:border-accent focus:outline-none', isRTL && 'text-right')} />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-on-surface-tertiary uppercase tracking-wider mb-1 block">{isRTL ? 'النص المعروض' : 'Text on screen'}</label>
                      <input type="text" value={scene.textOnScreen} onChange={(e) => updateScene(scene.id, 'textOnScreen', e.target.value)} className={cn('w-full rounded-lg px-3 py-2 text-xs bg-surface-secondary text-on-surface border border-border focus:border-accent focus:outline-none', isRTL && 'text-right')} />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-[10px] font-medium text-on-surface-tertiary uppercase tracking-wider mb-1 block">{isRTL ? 'الانتقال' : 'Transition'}</label>
                        <select value={scene.transition} onChange={(e) => updateScene(scene.id, 'transition', e.target.value)} className="w-full rounded-lg px-3 py-2 text-xs bg-surface-secondary text-on-surface border border-border focus:border-accent focus:outline-none">
                          {TRANSITION_OPTIONS.map((t) => (<option key={t} value={t}>{t}</option>))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] font-medium text-on-surface-tertiary uppercase tracking-wider mb-1 block">{isRTL ? 'الألوان' : 'Colors'}</label>
                        <input type="text" value={scene.colors} onChange={(e) => updateScene(scene.id, 'colors', e.target.value)} placeholder={isRTL ? 'مثال: #1e1e2e, #cdd6f4' : 'e.g. #1e1e2e, #cdd6f4'} className={cn('w-full rounded-lg px-3 py-2 text-xs bg-surface-secondary text-on-surface border border-border focus:border-accent focus:outline-none', isRTL && 'text-right')} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-on-surface-tertiary uppercase tracking-wider mb-1 block">{isRTL ? 'ملاحظات' : 'Notes'}</label>
                      <input type="text" value={scene.notes} onChange={(e) => updateScene(scene.id, 'notes', e.target.value)} className={cn('w-full rounded-lg px-3 py-2 text-xs bg-surface-secondary text-on-surface border border-border focus:border-accent focus:outline-none', isRTL && 'text-right')} />
                    </div>
                  </div>
                </div>
              ))}

              {scenes.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-on-surface-tertiary">
                  <p className="text-sm mb-3">{isRTL ? 'لا توجد مشاهد. اضف مشهد جديد.' : 'No scenes. Add a new scene.'}</p>
                  <button onClick={addScene} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border border-border hover:bg-surface-secondary transition-colors">
                    <Plus size={14} />
                    {isRTL ? 'اضف مشهد' : 'Add Scene'}
                  </button>
                </div>
              )}
            </div>

            {scenes.length > 0 && (
              <div className="border-t border-border px-6 py-3 flex items-center justify-between bg-surface shrink-0">
                <p className="text-xs text-on-surface-tertiary">
                  {isRTL
                    ? `${scenes.length} مشاهد | المدة: ${totalStoryboardDuration} ثانية`
                    : `${scenes.length} scenes | Duration: ${totalStoryboardDuration}s`}
                </p>
                <button
                  onClick={handleApproveStoryboard}
                  disabled={isStreaming}
                  className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  <CheckCircle2 size={16} />
                  {isRTL ? 'اعتماد الستوري بورد وتوليد الكود' : 'Approve Storyboard & Generate Code'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══ STAGE 3: Code Generation & Render ═══ */}
        {stage === 'render' && (
          <div className="flex flex-1 overflow-hidden">
            {/* Left: Chat + Code */}
            <div className="flex flex-col w-[60%] border-e border-border">
              <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
                <button
                  onClick={handleGoBack}
                  className="flex items-center gap-1 text-xs text-on-surface-tertiary hover:text-on-surface transition-colors mb-2"
                >
                  <ArrowLeft size={14} />
                  {isRTL ? 'رجوع للستوري بورد' : 'Back to Storyboard'}
                </button>

                {messages.map((msg) => {
                  // In the render stage, strip fenced code blocks from
                  // assistant messages — the code is already shown in the
                  // right panel's "Code" section, so showing it inline in the
                  // chat creates a duplicate display.
                  const displayContent = msg.role === 'assistant'
                    ? stripCodeBlocks(msg.content)
                    : msg.content;
                  if (msg.role === 'assistant' && !displayContent) return null;
                  return (
                    <div key={msg.id} className={cn('flex gap-3', msg.role === 'user' ? (isRTL ? 'flex-row-reverse' : '') : '')}>
                      {msg.role === 'assistant' && (
                        <div className="w-7 h-7 rounded-lg bg-rose-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {isRTL ? 'ك' : 'C'}
                        </div>
                      )}
                      <div className={cn('rounded-xl px-4 py-3 text-sm max-w-[85%]', msg.role === 'user' ? 'bg-accent text-on-accent ms-auto' : 'bg-surface-secondary text-on-surface')}>
                        {msg.role === 'assistant' ? renderMarkdown(displayContent) : (
                          <p className="whitespace-pre-wrap">{displayContent}</p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {streamingContent && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-lg bg-rose-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {isRTL ? 'ك' : 'C'}
                    </div>
                    <div className="rounded-xl px-4 py-3 text-sm bg-surface-secondary text-on-surface max-w-[85%]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripCodeBlocks(streamingContent)}</ReactMarkdown>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              <div className="border-t border-border px-4 py-3">
                <div className="flex gap-2 items-end">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isRTL ? 'تعليمات إضافية للكود...' : 'Additional code instructions...'}
                    rows={2}
                    className={cn(
                      'flex-1 resize-none rounded-xl px-4 py-3 text-sm',
                      'bg-surface-secondary text-on-surface placeholder:text-on-surface-tertiary',
                      'border border-border focus:border-accent focus:outline-none',
                      isRTL && 'text-right'
                    )}
                  />
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={() => { cancelRef.current?.(); if (streamingContent.trim()) setMessages(m => [...m, {id: crypto.randomUUID(), role: 'assistant', content: streamingContent + '\n\n_(توقف)_'}]); setIsStreaming(false); setStreamingContent(''); }}
                      className="p-3 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                    >
                      <Square size={16} fill="currentColor" />
                    </button>
                  ) : (
                    <button onClick={handleSend} disabled={!input.trim()}
                      className={cn('p-3 rounded-xl transition-colors', input.trim() ? 'bg-rose-500 text-white hover:bg-rose-600' : 'bg-surface-tertiary text-on-surface-tertiary')}>
                      <Send size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Preview + Assets + Code */}
            <div className="flex flex-col w-[40%] overflow-auto">
              {/* Preview / Rendered Video */}
              <div className="border-b border-border p-4">
                <h3 className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wider mb-3">
                  {isRTL ? 'معاينة' : 'Preview'}
                </h3>

                {renderResult && (
                  <div className="mb-3">
                    <video controls className="w-full rounded-lg border border-border bg-black" src={`${API_BASE_URL}${renderResult.downloadUrl}`}>
                      <track kind="captions" />
                    </video>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={async () => {
                          const res = await fetch(`${API_BASE_URL}${renderResult.downloadUrl}`);
                          const blob = await res.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url; a.download = renderResult.filename;
                          document.body.appendChild(a); a.click();
                          document.body.removeChild(a); URL.revokeObjectURL(url);
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-rose-500 text-white hover:bg-rose-600 transition-colors"
                      >
                        <Download size={12} />
                        {isRTL ? 'تحميل' : 'Download'}
                      </button>
                      <button onClick={handleRenderVideo} disabled={isRendering} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-border text-on-surface hover:bg-surface-secondary transition-colors">
                        <RefreshCw size={12} />
                        {isRTL ? 'اعادة التصدير' : 'Render Again'}
                      </button>
                      <span className="text-[10px] text-on-surface-tertiary ms-auto">{(renderResult.durationMs / 1000).toFixed(1)}s</span>
                    </div>

                    {/* Post-render scene editor */}
                    {scenes.length > 0 && (
                      <div className="mt-4 p-3 rounded-lg border border-rose-500/20 bg-rose-500/5 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-on-surface">
                            {isRTL ? '✏️ تعديل مشهد بعد التصدير' : '✏️ Edit a scene'}
                          </p>
                          <button
                            onClick={() => {
                              const msg = isRTL
                                ? `أريد تعديل الفيديو. هذا ملخص المشاهد الحالية:\n${scenes.map(s => `- م${s.number} (${s.startTime}-${s.endTime}s): ${s.textOnScreen || s.description}`).join('\n')}\n\nماذا تقترح لتحسينه؟ أو أخبرني ماذا تعدّل.`
                                : `I want to edit this video. Current scenes:\n${scenes.map(s => `- S${s.number} (${s.startTime}-${s.endTime}s): ${s.textOnScreen || s.description}`).join('\n')}\n\nWhat would you suggest, or tell me what you'd change.`;
                              sendMessage(msg);
                            }}
                            className="text-[10px] px-2 py-1 rounded text-rose-600 hover:bg-rose-500/10"
                          >
                            💬 {isRTL ? 'تحدث مع الكرييتف' : 'Chat with Creative'}
                          </button>
                        </div>
                        <div className="space-y-1">
                          {scenes.map((scene, idx) => (
                            <div key={scene.id} className="rounded border border-border bg-surface">
                              <button
                                onClick={() => setEditingSceneIdx(editingSceneIdx === idx ? null : idx)}
                                className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] text-start hover:bg-surface-secondary"
                              >
                                <span className="font-mono text-on-surface-tertiary">{scene.startTime}s→{scene.endTime}s</span>
                                <span className="flex-1 mx-2 truncate text-on-surface">{scene.textOnScreen || scene.description || `م${scene.number}`}</span>
                                <span className="text-rose-500">{editingSceneIdx === idx ? '−' : '✎'}</span>
                              </button>
                              {editingSceneIdx === idx && (
                                <div className="p-2 border-t border-border space-y-2">
                                  <textarea
                                    value={sceneEditRequest}
                                    onChange={(e) => setSceneEditRequest(e.target.value)}
                                    rows={2}
                                    placeholder={isRTL
                                      ? 'مثل: "غيّر الخلفية لأزرق" أو "اجعل النص أكبر" أو "أضف شعار في الأعلى"'
                                      : 'e.g. "change bg to blue" or "make text bigger" or "add logo on top"'}
                                    className="w-full text-xs p-2 rounded bg-surface-secondary border border-border text-on-surface resize-none"
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => {
                                        if (!sceneEditRequest.trim()) return;
                                        const msg = isRTL
                                          ? `عدّل المشهد ${scene.number} فقط (${scene.startTime}–${scene.endTime}s) بالتعديل التالي:\n\n${sceneEditRequest}\n\nالمشهد الحالي:\n- الوصف: ${scene.description}\n- النص: ${scene.textOnScreen}\n- الانتقال: ${scene.transition}\n- الألوان: ${scene.colors}\n\nاحتفظ بباقي المشاهد كما هي — أعد كتابة الكود الكامل مع هذا التعديل فقط.`
                                          : `Edit ONLY scene ${scene.number} (${scene.startTime}–${scene.endTime}s) with:\n\n${sceneEditRequest}\n\nCurrent scene:\n- desc: ${scene.description}\n- text: ${scene.textOnScreen}\n- transition: ${scene.transition}\n- colors: ${scene.colors}\n\nKeep all other scenes unchanged — rewrite the complete code with this edit only.`;
                                        sendMessage(msg);
                                        setSceneEditRequest('');
                                        setEditingSceneIdx(null);
                                      }}
                                      disabled={!sceneEditRequest.trim()}
                                      className="flex-1 h-7 rounded text-[11px] font-medium bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-40"
                                    >
                                      {isRTL ? 'أرسل التعديل للكرييتف' : 'Send edit'}
                                    </button>
                                    <button
                                      onClick={() => { setEditingSceneIdx(null); setSceneEditRequest(''); }}
                                      className="h-7 px-3 rounded text-[11px] text-on-surface-tertiary hover:bg-surface-secondary"
                                    >
                                      {isRTL ? 'إلغاء' : 'Cancel'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-on-surface-tertiary text-center">
                          {isRTL ? 'بعد إرسال التعديل، الكرييتف يعيد كتابة الكود — ثم اضغط "إعادة التصدير"' : 'After edit, Creative rewrites the code — then hit "Render Again"'}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {renderError && (
                  <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">{isRTL ? 'خطأ في التصدير' : 'Render Error'}</p>
                    <pre className="text-[10px] text-red-500 whitespace-pre-wrap max-h-24 overflow-auto">{renderError}</pre>
                  </div>
                )}

                {isRendering && (
                  <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 flex flex-col items-center gap-2">
                    <Loader2 size={24} className="animate-spin text-rose-500" />
                    <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{isRTL ? 'جاري التصدير... قد يستغرق 30-60 ثانية' : 'Rendering... this may take 30-60 seconds'}</p>
                  </div>
                )}

                {previewImage && !renderResult && (
                  <div className="mb-3">
                    <img src={previewImage} alt="Preview frame" className="w-full rounded-lg border border-border" />
                    <p className="text-[10px] text-on-surface-tertiary mt-1 text-center">{isRTL ? 'معاينة الإطار الأول' : 'Frame 0 preview'}</p>
                  </div>
                )}

                {isPreviewing && (
                  <div className="mb-3 rounded-lg border border-border bg-surface-secondary p-4 flex flex-col items-center gap-2">
                    <Loader2 size={20} className="animate-spin text-on-surface-tertiary" />
                    <p className="text-xs text-on-surface-tertiary">{isRTL ? 'جاري المعاينة...' : 'Generating preview...'}</p>
                  </div>
                )}

                {!renderResult && !previewImage && !isRendering && !isPreviewing && !renderError && (
                  <div className="rounded-lg border border-dashed border-border bg-surface-secondary flex flex-col items-center justify-center py-12">
                    <Play size={32} className="text-on-surface-tertiary mb-2 opacity-30" />
                    <p className="text-xs text-on-surface-tertiary">
                      {codeBlocks.length > 0
                        ? isRTL ? 'اضغط "معاينة" او "تصدير الفيديو" لرؤية النتيجة' : 'Click "Preview" or "Render Video" to see the result'
                        : isRTL ? 'جاري توليد الكود...' : 'Generating code...'}
                    </p>
                  </div>
                )}
              </div>

              {/* Assets Panel */}
              <div className="border-b border-border p-4">
                <h3 className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wider mb-3">
                  {isRTL ? 'الملفات المرفوعة' : 'Assets'}
                </h3>
                <input
                  ref={assetInputRef}
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp,.mp4,.mov"
                  className="hidden"
                  onChange={handleAssetUpload}
                />
                <button
                  onClick={() => assetInputRef.current?.click()}
                  className="w-full rounded-lg border border-dashed border-border bg-surface-secondary hover:bg-surface-tertiary transition-colors flex items-center justify-center gap-2 py-3 text-xs text-on-surface-tertiary"
                >
                  <Upload size={14} />
                  {isRTL ? 'ارفع صور او مقاطع' : 'Upload images or videos'}
                </button>
                {assets.length > 0 && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {assets.map((asset) => (
                      <div key={asset.filename} className="relative group rounded-lg border border-border overflow-hidden bg-surface-secondary">
                        {asset.type === 'image' ? (
                          <img
                            src={`${API_BASE_URL}${asset.url}`}
                            alt={asset.filename}
                            className="w-full h-16 object-cover cursor-pointer"
                            onClick={() => handleCopyAssetPath(asset.filename)}
                          />
                        ) : (
                          <div
                            className="w-full h-16 flex items-center justify-center cursor-pointer"
                            onClick={() => handleCopyAssetPath(asset.filename)}
                          >
                            <FileVideo size={20} className="text-on-surface-tertiary" />
                          </div>
                        )}
                        <div className="px-1.5 py-1 flex items-center justify-between">
                          <span className="text-[9px] text-on-surface-tertiary truncate flex-1">{asset.filename}</span>
                          <button
                            onClick={() => handleDeleteAsset(asset.filename)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-on-surface-tertiary hover:text-red-500 transition-all"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                        {copiedAsset === asset.filename && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-[10px]">
                            {isRTL ? 'تم النسخ' : 'Copied!'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* RENDER ACTION BANNER — prominent when code is ready */}
              {codeBlocks.length > 0 && !renderResult && (
                <div className="p-4 bg-emerald-500/10 border-b border-emerald-500/20">
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-2">
                    {isRTL ? 'الكود جاهز للتصدير' : 'Code is ready to render'}
                  </p>

                  {/* Export options toggle */}
                  <button
                    onClick={() => setShowExportOptions((s) => !s)}
                    className="flex items-center gap-1.5 text-xs text-on-surface-secondary hover:text-accent mb-2"
                  >
                    <SettingsIcon size={12} />
                    {isRTL ? 'خيارات التصدير' : 'Export options'}
                    {showExportOptions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    <span className="ms-2 text-[10px] text-on-surface-tertiary">
                      {outputFormat.toUpperCase()}
                      {trimEnabled && ` · ${trimStart}s–${trimEnd}s`}
                      {audioPlan.enabled && audioPlan.segments.length > 0 && ` · ${audioPlan.segments.length} ${isRTL ? 'صوت' : 'audio'}`}
                    </span>
                  </button>

                  {showExportOptions && (
                    <div className="mb-3 space-y-3 p-3 rounded-lg border border-border bg-surface">
                      {/* Cost tier override (per-video) */}
                      <div>
                        <div className="text-xs font-semibold text-on-surface mb-1.5 flex items-center justify-between">
                          <span>{isRTL ? 'مستوى التكلفة (لهذا الفيديو)' : 'Cost tier (this video)'}</span>
                          {estCost && (
                            <span className="text-[10px] text-accent font-mono">
                              ≈ ${estCost.totalUSD.toFixed(4)}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          {(['zero-cost', 'saving', 'medium', 'max'] as const).map((t) => (
                            <button
                              key={t}
                              onClick={() => setCostTier(t)}
                              className={cn(
                                'h-8 rounded text-[11px] font-semibold',
                                costTier === t
                                  ? 'bg-accent text-on-accent'
                                  : 'bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary'
                              )}
                            >
                              {t === 'zero-cost' ? (isRTL ? 'صفر' : 'Zero')
                                : t === 'saving' ? (isRTL ? 'توفير' : 'Saving')
                                : t === 'medium' ? (isRTL ? 'متوسط' : 'Medium')
                                : (isRTL ? 'أعلى' : 'Max')}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              const r = await apiFetch<{ totalUSD: number; lines: Array<{ service: string; usd: number }> }>('/api/cost/estimate', {
                                method: 'POST',
                                body: JSON.stringify({ audioPlan: audioPlan.enabled ? audioPlan : undefined }),
                              });
                              setEstCost(r);
                            } catch { /* ignore */ }
                          }}
                          className="mt-1.5 text-[10px] text-accent hover:underline"
                        >
                          {isRTL ? 'احسب التكلفة التقريبية' : 'Estimate cost'}
                        </button>
                        {estCost && estCost.lines.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {estCost.lines.map((l, i) => (
                              <div key={i} className="text-[10px] text-on-surface-tertiary flex justify-between">
                                <span>{l.service}</span>
                                <span className="font-mono">${l.usd.toFixed(4)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Format */}
                      <div>
                        <div className="text-xs font-semibold text-on-surface mb-1.5">
                          {isRTL ? 'الصيغة' : 'Format'}
                        </div>
                        <div className="flex gap-1">
                          {(['mp4', 'gif', 'webm'] as const).map((f) => (
                            <button
                              key={f}
                              onClick={() => setOutputFormat(f)}
                              className={cn(
                                'flex-1 h-8 rounded text-xs font-semibold uppercase',
                                outputFormat === f
                                  ? 'bg-accent text-on-accent'
                                  : 'bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary'
                              )}
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                        {outputFormat === 'gif' && (duration > 5 && !trimEnabled) && (
                          <p className="text-[10px] text-amber-500 mt-1">
                            {isRTL ? '⚠️ GIF لمدة ≥ 5 ث يصير حجمه كبير جداً' : '⚠️ GIF > 5s gets huge'}
                          </p>
                        )}
                      </div>

                      {/* Trim */}
                      <div>
                        <label className="flex items-center gap-2 text-xs font-semibold text-on-surface mb-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={trimEnabled}
                            onChange={(e) => {
                              setTrimEnabled(e.target.checked);
                              if (e.target.checked) { setTrimStart(0); setTrimEnd(duration); }
                            }}
                            className="accent-accent"
                          />
                          <Scissors size={12} />
                          {isRTL ? 'اقتطاع نطاق' : 'Trim range'}
                        </label>
                        {trimEnabled && (
                          <div className="flex items-center gap-2 text-xs">
                            <input
                              type="number" step={0.1} min={0} max={duration}
                              value={trimStart}
                              onChange={(e) => setTrimStart(Math.max(0, Math.min(duration, Number(e.target.value))))}
                              className="w-16 h-7 px-2 rounded bg-surface-secondary border border-border text-on-surface"
                            />
                            <span className="text-on-surface-tertiary">s →</span>
                            <input
                              type="number" step={0.1} min={0} max={duration}
                              value={trimEnd}
                              onChange={(e) => setTrimEnd(Math.max(0, Math.min(duration, Number(e.target.value))))}
                              className="w-16 h-7 px-2 rounded bg-surface-secondary border border-border text-on-surface"
                            />
                            <span className="text-on-surface-tertiary">s</span>
                            <span className="text-on-surface-tertiary ms-auto">
                              ({(trimEnd - trimStart).toFixed(1)}s)
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Audio plan */}
                      <AudioPlanEditor
                        durationSec={trimEnabled ? (trimEnd - trimStart) : duration}
                        topic={scenes.length > 0 ? scenes.map(s => s.textOnScreen).filter(Boolean).join(' · ').slice(0, 80) : undefined}
                        scenes={scenes.length > 0 ? scenes.map(s => ({ text: s.textOnScreen || s.description, durationSec: s.endTime - s.startTime })) : undefined}
                        value={audioPlan}
                        onChange={setAudioPlan}
                      />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleQuickPreview}
                      disabled={isPreviewing || isRendering}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
                    >
                      {isPreviewing ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                      {isRTL ? 'معاينة سريعة' : 'Quick Preview'}
                    </button>
                    <button
                      onClick={handleRenderVideo}
                      disabled={isRendering || isPreviewing}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {isRendering ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                      {isRTL ? 'تصدير الفيديو' : 'Render Video'}
                    </button>
                  </div>
                  {isRendering && (
                    <div className="mt-2 bg-surface-tertiary rounded-full h-2 overflow-hidden">
                      <div className="bg-emerald-500 h-full animate-pulse" style={{ width: '60%' }} />
                    </div>
                  )}
                </div>
              )}

              {/* Code Blocks */}
              {codeBlocks.length > 0 && (
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-on-surface-tertiary uppercase tracking-wider">
                      {isRTL ? 'الكود' : 'Code'}
                    </h3>
                    <button onClick={handleCopyAll} className="flex items-center gap-1 text-[10px] text-on-surface-tertiary hover:text-accent transition-colors">
                      {copiedIdx === -1 ? <Check size={12} /> : <Copy size={12} />}
                      {isRTL ? 'نسخ الكل' : 'Copy All'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {codeBlocks.map((code, i) => (
                      <div key={i} className="relative group">
                        <pre className="bg-[#1e1e2e] text-[#cdd6f4] rounded-lg p-3 overflow-x-auto text-[11px] leading-relaxed max-h-48">
                          <code>{code}</code>
                        </pre>
                        <button
                          onClick={() => handleCopyCode(code, i)}
                          className="absolute top-2 end-2 p-1.5 rounded bg-white/10 text-white/60 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          {copiedIdx === i ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Bar */}
      <div className="flex items-center gap-4 px-6 py-3 border-t border-border bg-surface shrink-0">
        {/* Format Selector */}
        <div className="flex items-center gap-1.5">
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setFormat(opt.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors',
                format === opt.id
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 font-medium'
                  : 'text-on-surface-tertiary hover:bg-surface-secondary'
              )}
            >
              {opt.id === 'reel' ? <Film size={12} /> : opt.id === 'landscape' ? <Monitor size={12} /> : <Square size={12} />}
              {opt.label[language]}
              <span className="text-[10px] opacity-60">{opt.size}</span>
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-border" />

        {/* Duration Selector */}
        <div className="flex items-center gap-1">
          {DURATION_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-xs transition-colors',
                duration === d
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 font-medium'
                  : 'text-on-surface-tertiary hover:bg-surface-secondary'
              )}
            >
              {d}s
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {stage === 'discussion' && (
          <button
            onClick={handleGenerateStoryboard}
            disabled={isStreaming}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
          >
            <Sparkles size={14} />
            {isRTL ? 'انشئ ستوري بورد' : 'Generate Storyboard'}
          </button>
        )}

        {stage === 'storyboard' && (
          <button
            onClick={handleApproveStoryboard}
            disabled={isStreaming || scenes.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <CheckCircle2 size={14} />
            {isRTL ? 'اعتماد وتوليد الكود' : 'Approve & Generate Code'}
          </button>
        )}

        {stage === 'render' && codeBlocks.length > 0 && (
          <>
            <button
              onClick={handleQuickPreview}
              disabled={isPreviewing || isRendering}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border border-border text-on-surface hover:bg-surface-secondary disabled:opacity-50 transition-colors"
            >
              {isPreviewing ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
              {isRTL ? 'معاينة' : 'Preview'}
            </button>

            <button
              onClick={handleRenderVideo}
              disabled={isRendering || isPreviewing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {isRendering ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {isRTL ? 'تصدير الفيديو' : 'Render Video'}
            </button>

            <button
              onClick={handleCopyAll}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border border-border text-on-surface hover:bg-surface-secondary transition-colors"
            >
              {copiedIdx === -1 ? <Check size={14} /> : <Copy size={14} />}
              {isRTL ? 'نسخ الكود' : 'Copy Code'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
