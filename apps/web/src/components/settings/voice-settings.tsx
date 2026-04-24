'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Play, Square, Check, Loader2, User, User2, RefreshCw, Sparkles, Upload, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch, API_BASE_URL } from '@/lib/api';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';

interface Voice {
  voiceId: string;
  name: string;
  category: string;
  gender: string;
  accent: string;
  age: string;
  description: string;
  previewUrl: string | null;
}

export function VoiceSettings() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('male');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cachedKeys, setCachedKeys] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState<string | null>(null);
  const [myVoices, setMyVoices] = useState<Array<{ voiceId: string; name: string; description: string; isMine: boolean; createdAt: string; samplesCount: number }>>([]);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [cloneFiles, setCloneFiles] = useState<File[]>([]);
  const [cloning, setCloning] = useState(false);
  const cloneInputRef = useRef<HTMLInputElement | null>(null);

  const cloneDirty = cloneOpen && (cloneName.trim().length > 0 || cloneFiles.length > 0);
  useUnsavedChanges(cloneDirty);

  const loadMyVoices = () => {
    apiFetch<{ voices: typeof myVoices }>('/api/voice/mine').then((r) => setMyVoices(r.voices || [])).catch(() => setMyVoices([]));
  };

  const startClone = async () => {
    if (cloneFiles.length < 1 || !cloneName.trim()) return;
    setCloning(true);
    try {
      const fd = new FormData();
      fd.append('name', cloneName.trim());
      fd.append('description', 'Cloned via Ruhool');
      for (const f of cloneFiles) fd.append('files', f, f.name);
      const res = await fetch(`${API_BASE_URL}/api/voice/clone`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCloneFiles([]); setCloneName(''); setCloneOpen(false);
      loadMyVoices();
      apiFetch<{ voices: Voice[] }>('/api/audio/voices').then((r) => setVoices(r.voices || [])).catch(() => {});
    } catch (err) {
      alert((isRTL ? 'فشل الاستنساخ: ' : 'Clone failed: ') + (err instanceof Error ? err.message : ''));
    } finally { setCloning(false); }
  };

  const deleteClone = async (voiceId: string) => {
    if (!confirm(isRTL ? 'حذف هذا الصوت نهائياً؟' : 'Delete this voice permanently?')) return;
    try {
      await fetch(`${API_BASE_URL}/api/voice/clone/${voiceId}`, { method: 'DELETE' });
      loadMyVoices();
    } catch {}
  };

  const refreshCacheStatus = () => {
    apiFetch<{ cached: string[] }>('/api/audio/voice-samples/status')
      .then((r) => setCachedKeys(new Set(r.cached)))
      .catch(() => {});
  };

  useEffect(() => {
    Promise.all([
      apiFetch<{ voices: Voice[] }>('/api/audio/voices').catch((e) => { setError(String(e)); return { voices: [] }; }),
      apiFetch<{ elevenlabsVoiceId: string }>('/api/settings/voice').catch(() => ({ elevenlabsVoiceId: '' })),
    ]).then(([v, s]) => {
      setVoices(v.voices || []);
      setSelected(s.elevenlabsVoiceId);
      refreshCacheStatus();
      loadMyVoices();
    }).finally(() => setLoading(false));
  }, []);

  // Build a cache key matching backend logic
  const cacheKeyFor = (v: Voice) => {
    const slug = (v.accent || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 12);
    return slug ? `${v.voiceId}__${slug}` : v.voiceId;
  };
  const isCached = (v: Voice) => cachedKeys.has(cacheKeyFor(v));

  const save = async (voiceId: string) => {
    setSelected(voiceId);
    setSaving(true);
    try {
      await apiFetch('/api/settings/voice', { method: 'PUT', body: JSON.stringify({ elevenlabsVoiceId: voiceId }) });
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  const playSample = async (v: Voice) => {
    if (playing === v.voiceId) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlaying(v.voiceId);
    if (!isCached(v)) setGenerating(v.voiceId);
    try {
      const url = `${API_BASE_URL}/api/audio/voice-sample/${v.voiceId}?accent=${encodeURIComponent(v.accent || '')}`;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlaying(null); refreshCacheStatus(); };
      audio.onerror = () => { setPlaying(null); setGenerating(null); };
      audio.oncanplay = () => { setGenerating(null); refreshCacheStatus(); };
      await audio.play();
    } catch {
      setPlaying(null); setGenerating(null);
    }
  };

  const regenerate = async (v: Voice) => {
    if (!confirm(isRTL ? 'إعادة توليد العينة (سيستهلك حصة)؟' : 'Regenerate sample (uses quota)?')) return;
    try {
      await fetch(`${API_BASE_URL}/api/audio/voice-sample/${v.voiceId}`, { method: 'DELETE' });
      refreshCacheStatus();
      // Auto-play newly generated
      playSample(v);
    } catch {}
  };

  const filtered = voices.filter((v) => {
    if (genderFilter === 'all') return true;
    return v.gender.toLowerCase() === genderFilter;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-accent" size={24} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-[var(--radius-lg)] border border-warning/30 bg-warning/10 text-sm text-warning">
        {isRTL ? 'يحتاج مفتاح ElevenLabs أولاً. أضفه من الإعدادات ← خدمات خارجية.' : 'Needs ElevenLabs API key. Add it from Settings → External Services.'}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-medium text-on-surface mb-1 flex items-center gap-2">
          <Mic size={18} />
          {isRTL ? 'اختيار صوت التعليق' : 'Voice selection'}
        </h2>
        <p className="text-sm text-on-surface-secondary">
          {isRTL
            ? 'اختر الصوت الافتراضي لكل تعليق صوتي في الفيديوهات. اضغط «تشغيل» لسماع عينة.'
            : 'Choose the default voice for video narration. Click "Play" to hear a sample.'}
        </p>
        <p className="text-xs text-on-surface-tertiary mt-2 italic">
          {isRTL ? 'نص العينة: «مرحبا .. أنا أتكلم الفصحى .. واقدر اتكلم كويتي لو تبي ، بالتوفيق وفمان الله»' : 'Sample text: Arabic greeting phrase'}
        </p>
      </div>

      {/* My cloned voices */}
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
              <Sparkles size={14} className="text-accent" />
              {isRTL ? 'أصواتي المستنسخة' : 'My cloned voices'}
            </h3>
            <p className="text-xs text-on-surface-tertiary mt-0.5">
              {isRTL ? 'استنسخ صوتك برفع 3 عينات صوتية +30 ثانية لكل واحدة' : 'Clone your voice by uploading 3 audio samples (30s+ each)'}
            </p>
          </div>
          <button
            onClick={() => setCloneOpen(!cloneOpen)}
            className="px-3 py-1.5 rounded-[var(--radius)] bg-accent text-on-accent text-xs font-semibold hover:opacity-90 inline-flex items-center gap-1.5"
          >
            <Upload size={12} /> {isRTL ? 'استنسخ صوتي' : 'Clone your voice'}
          </button>
        </div>
        {cloneOpen && (
          <div className="space-y-2 p-3 rounded-[var(--radius)] bg-surface-secondary mb-3">
            <input
              type="text"
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value)}
              placeholder={isRTL ? 'اسم الصوت (مثل: صوتي)' : 'Voice name (e.g., My Voice)'}
              className="w-full px-3 py-2 rounded-[var(--radius)] bg-surface border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              ref={cloneInputRef}
              type="file"
              accept="audio/*"
              multiple
              onChange={(e) => setCloneFiles(Array.from(e.target.files || []))}
              className="w-full text-xs text-on-surface-secondary"
            />
            <div className="text-xs text-on-surface-tertiary">
              {cloneFiles.length > 0 && (isRTL ? `${cloneFiles.length} ملف مختار` : `${cloneFiles.length} file(s) selected`)}
            </div>
            <div className="flex gap-2">
              <button
                onClick={startClone}
                disabled={cloning || cloneFiles.length < 1 || !cloneName.trim()}
                className="px-3 py-1.5 rounded-[var(--radius)] bg-accent text-on-accent text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                {cloning ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {isRTL ? 'ابدأ الاستنساخ' : 'Start clone'}
              </button>
              <button onClick={() => { setCloneOpen(false); setCloneFiles([]); setCloneName(''); }} className="px-3 py-1.5 rounded-[var(--radius)] bg-surface border border-border text-xs">
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        )}
        {myVoices.length === 0 ? (
          <p className="text-xs text-on-surface-tertiary italic">{isRTL ? 'لا يوجد أصوات مستنسخة بعد' : 'No cloned voices yet'}</p>
        ) : (
          <div className="space-y-1.5">
            {myVoices.map((v) => (
              <div key={v.voiceId} className="flex items-center justify-between px-3 py-2 rounded-[var(--radius)] bg-surface-secondary">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="px-1.5 py-0.5 rounded bg-accent/20 text-accent text-[10px] font-bold shrink-0">🎤 {isRTL ? 'أنا' : 'Mine'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-on-surface truncate">{v.name}</div>
                    <div className="text-[10px] text-on-surface-tertiary font-mono truncate">{v.voiceId}</div>
                  </div>
                </div>
                <button onClick={() => save(v.voiceId)} className={cn('px-2 py-1 rounded text-[10px] font-semibold', selected === v.voiceId ? 'bg-accent text-on-accent' : 'bg-surface border border-border text-on-surface-secondary')}>
                  {selected === v.voiceId ? (isRTL ? '✓ مختار' : '✓ Selected') : (isRTL ? 'اختر' : 'Select')}
                </button>
                <button onClick={() => deleteClone(v.voiceId)} className="p-1 text-error hover:bg-error/10 rounded ms-1" title={isRTL ? 'حذف' : 'Delete'}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gender filter */}
      <div className="flex gap-1 p-1 rounded-[var(--radius)] bg-surface-secondary w-fit">
        {(['male', 'female', 'all'] as const).map((g) => (
          <button
            key={g}
            onClick={() => setGenderFilter(g)}
            className={cn(
              'px-3 py-1.5 rounded text-xs font-semibold',
              genderFilter === g ? 'bg-accent text-on-accent' : 'text-on-surface-secondary hover:bg-surface-tertiary'
            )}
          >
            {g === 'male' ? (isRTL ? 'ذكر' : 'Male') : g === 'female' ? (isRTL ? 'أنثى' : 'Female') : (isRTL ? 'الكل' : 'All')}
            <span className="text-[10px] text-on-surface-tertiary ms-1">
              ({voices.filter((v) => g === 'all' || v.gender.toLowerCase() === g).length})
            </span>
          </button>
        ))}
      </div>

      {/* Voice list */}
      <div className="space-y-2 max-h-[600px] overflow-auto pr-1">
        {filtered.map((v) => {
          const isSelected = selected === v.voiceId;
          const isPlaying = playing === v.voiceId;
          const GenderIcon = v.gender.toLowerCase() === 'female' ? User : User2;
          return (
            <div
              key={v.voiceId}
              className={cn(
                'p-3 rounded-[var(--radius)] border transition-all',
                isSelected ? 'border-accent bg-accent/5' : 'border-border bg-surface hover:border-accent/40'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                  v.gender.toLowerCase() === 'female' ? 'bg-pink-500/10 text-pink-500' : 'bg-blue-500/10 text-blue-500'
                )}>
                  <GenderIcon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-on-surface">{v.name}</span>
                    {isSelected && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-on-accent font-medium">
                        {isRTL ? 'المختار' : 'Selected'}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-on-surface-tertiary flex gap-2 flex-wrap mt-0.5">
                    {v.gender && <span>{v.gender}</span>}
                    {v.accent && <span>· {v.accent}</span>}
                    {v.age && <span>· {v.age}</span>}
                    {v.category && <span>· {v.category}</span>}
                  </div>
                  {v.description && (
                    <p className="text-xs text-on-surface-secondary mt-1 line-clamp-2">{v.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isCached(v) && !isPlaying && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success font-medium" title={isRTL ? 'مخزّن — تشغيل فوري' : 'Cached — instant play'}>
                      ⚡ {isRTL ? 'مخزّن' : 'cached'}
                    </span>
                  )}
                  <button
                    onClick={() => playSample(v)}
                    disabled={generating === v.voiceId}
                    className={cn(
                      'p-2 rounded-full transition-colors',
                      isPlaying ? 'bg-error text-white'
                        : generating === v.voiceId ? 'bg-warning text-white'
                        : 'bg-surface-secondary hover:bg-accent hover:text-on-accent text-on-surface-secondary'
                    )}
                    title={isCached(v) ? (isRTL ? 'تشغيل (مخزّن)' : 'Play (cached)') : (isRTL ? 'توليد + تشغيل' : 'Generate + play')}
                  >
                    {generating === v.voiceId ? <Loader2 size={14} className="animate-spin" />
                      : isPlaying ? <Square size={14} fill="currentColor" />
                      : <Play size={14} fill="currentColor" />}
                  </button>
                  {isCached(v) && (
                    <button
                      onClick={() => regenerate(v)}
                      className="p-2 rounded-full bg-surface-secondary hover:bg-warning/20 text-on-surface-tertiary hover:text-warning"
                      title={isRTL ? 'إعادة توليد (يستهلك حصة)' : 'Regenerate (uses quota)'}
                    >
                      <RefreshCw size={12} />
                    </button>
                  )}
                  <button
                    onClick={() => save(v.voiceId)}
                    disabled={isSelected || saving}
                    className={cn(
                      'px-3 py-2 rounded text-xs font-semibold transition-colors',
                      isSelected ? 'bg-success/20 text-success cursor-default' : 'bg-accent text-on-accent hover:opacity-90'
                    )}
                  >
                    {isSelected ? <Check size={14} /> : (isRTL ? 'اختر' : 'Select')}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-sm text-on-surface-tertiary">
            {isRTL ? 'لا توجد أصوات بهذا الفلتر' : 'No voices match this filter'}
          </div>
        )}
      </div>

      <div className="text-xs text-on-surface-tertiary pt-2 border-t border-border space-y-1">
        <p>
          {isRTL
            ? 'ملاحظة: العينة تتولّد مرة واحدة وتُخزّن للتشغيل الفوري لاحقاً. زر ⟳ يعيد التوليد عند الحاجة.'
            : 'Note: each sample is generated once and cached for instant replay. ⟳ regenerates on demand.'}
        </p>
        <p>
          {isRTL
            ? 'الجملة تُكيَّف حسب لهجة الصوت — مثلاً المصرية يُضاف لها: «وبأدر أتكلم مصري لو حابب».'
            : 'Sample text adapts to the voice accent (e.g. Egyptian voices get an extra Egyptian phrase).'}
        </p>
      </div>
    </div>
  );
}
