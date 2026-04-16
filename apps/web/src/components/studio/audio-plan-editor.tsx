'use client';

import { useState, useRef } from 'react';
import { Mic, Music, Sparkles, Play, Trash2, Plus, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

export type AudioSegment = {
  startSec: number;
  endSec: number;
  kind: 'voice' | 'sfx' | 'music';
  text: string;
  voiceId?: string;
  volume?: number;
};

export type AudioPlan = {
  enabled: boolean;
  backend: 'elevenlabs' | 'stableaudio' | 'audiocraft';
  segments: AudioSegment[];
};

interface Props {
  durationSec: number;
  topic?: string;
  scenes?: Array<{ text: string; durationSec: number }>;
  value: AudioPlan;
  onChange: (plan: AudioPlan) => void;
}

const KIND_META = {
  voice: { icon: Mic,       label: { ar: 'تعليق صوتي', en: 'Voice-over' },   color: 'bg-blue-500/10 text-blue-500 border-blue-500/30' },
  sfx:   { icon: Sparkles,  label: { ar: 'مؤثر صوتي', en: 'Sound effect' }, color: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
  music: { icon: Music,     label: { ar: 'موسيقى',    en: 'Music' },         color: 'bg-purple-500/10 text-purple-500 border-purple-500/30' },
} as const;

export function AudioPlanEditor({ durationSec, topic, scenes, value, onChange }: Props) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [generating, setGenerating] = useState(false);
  const [previewing, setPreviewing] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const suggest = async () => {
    setGenerating(true);
    try {
      const plan = await apiFetch<AudioPlan>('/api/audio/plan/suggest', {
        method: 'POST',
        body: JSON.stringify({ topic: topic || 'video', durationSec, language, scenes }),
      });
      onChange({ ...plan, enabled: true });
    } catch {
      /* ignore */
    } finally {
      setGenerating(false);
    }
  };

  const setEnabled = (enabled: boolean) => onChange({ ...value, enabled });

  const addSegment = (kind: 'voice' | 'sfx' | 'music') => {
    const seg: AudioSegment = {
      startSec: 0, endSec: durationSec,
      kind,
      text: kind === 'voice' ? (isRTL ? 'اكتب النص هنا…' : 'Write script here…')
          : kind === 'sfx'   ? (isRTL ? 'صف الصوت…' : 'Describe the sound…')
          :                     (isRTL ? 'موسيقى خلفية هادئة' : 'calm background music'),
      volume: kind === 'music' ? 0.3 : 1.0,
    };
    onChange({ ...value, enabled: true, segments: [...value.segments, seg] });
  };

  const updateSeg = (i: number, patch: Partial<AudioSegment>) => {
    const next = value.segments.map((s, idx) => idx === i ? { ...s, ...patch } : s);
    onChange({ ...value, segments: next });
  };

  const removeSeg = (i: number) => {
    onChange({ ...value, segments: value.segments.filter((_, idx) => idx !== i) });
  };

  const preview = async (i: number) => {
    const seg = value.segments[i];
    setPreviewing(i);
    try {
      const endpoint = seg.kind === 'voice' ? '/api/audio/tts'
                     : seg.kind === 'music' ? '/api/audio/music'
                     : '/api/audio/sfx';
      const body = seg.kind === 'voice' ? { text: seg.text, voiceId: seg.voiceId }
                  : seg.kind === 'music' ? { prompt: seg.text, durationSec: Math.min(20, seg.endSec - seg.startSec) }
                  : { description: seg.text, durationSec: seg.endSec - seg.startSec };
      const res = await fetch(`/api${endpoint.replace(/^\/api/, '')}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        alert(isRTL ? 'فشل التوليد — تأكد من مفتاح API' : 'Generation failed — check API key');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) audioRef.current.pause();
      audioRef.current = new Audio(url);
      audioRef.current.play();
    } catch {
      alert(isRTL ? 'خطأ في المعاينة' : 'Preview error');
    } finally {
      setPreviewing(null);
    }
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Volume2 size={18} className="text-accent" />
          <h3 className="text-base font-semibold text-on-surface">
            {isRTL ? 'خطة الصوت' : 'Audio plan'}
          </h3>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-accent"
          />
          <span className="text-on-surface-secondary">{isRTL ? 'تفعيل' : 'Enabled'}</span>
        </label>
      </div>

      {!value.enabled && (
        <div className="text-sm text-on-surface-tertiary py-4 text-center">
          {isRTL ? 'المقطع سيُصدَّر بدون صوت. فعّل لإضافة تعليق/موسيقى.' : 'Video will export silent. Enable to add voice/music.'}
        </div>
      )}

      {value.enabled && (
        <>
          {value.segments.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-sm text-on-surface-tertiary">
                {isRTL ? 'لا توجد مقاطع صوتية بعد' : 'No audio segments yet'}
              </p>
              <button
                onClick={suggest}
                disabled={generating}
                className="px-4 py-2 rounded-[var(--radius)] bg-accent text-on-accent text-sm font-medium flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
              >
                <Sparkles size={14} />
                {generating ? (isRTL ? 'جارٍ التوليد…' : 'Generating…') : (isRTL ? 'اقتراح تلقائي' : 'Auto-suggest')}
              </button>
            </div>
          )}

          {value.segments.map((seg, i) => {
            const meta = KIND_META[seg.kind];
            const Icon = meta.icon;
            return (
              <div key={i} className={cn('rounded-[var(--radius)] border p-3 space-y-2', meta.color)}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon size={14} />
                    <span className="text-xs font-semibold">{meta.label[language]}</span>
                    <div className="flex items-center gap-1 text-xs text-on-surface-tertiary">
                      <input
                        type="number" step={0.5} min={0} max={durationSec}
                        value={seg.startSec}
                        onChange={(e) => updateSeg(i, { startSec: Number(e.target.value) })}
                        className="w-14 h-6 px-1 rounded bg-surface border border-border text-xs"
                      />
                      <span>→</span>
                      <input
                        type="number" step={0.5} min={0} max={durationSec}
                        value={seg.endSec}
                        onChange={(e) => updateSeg(i, { endSec: Number(e.target.value) })}
                        className="w-14 h-6 px-1 rounded bg-surface border border-border text-xs"
                      />
                      <span>s</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => preview(i)}
                      disabled={previewing === i}
                      className="p-1.5 rounded hover:bg-surface-secondary text-on-surface-secondary"
                      title={isRTL ? 'معاينة' : 'Preview'}
                    >
                      <Play size={12} />
                    </button>
                    <button
                      onClick={() => removeSeg(i)}
                      className="p-1.5 rounded hover:bg-red-500/10 text-on-surface-secondary hover:text-red-500"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <textarea
                  value={seg.text}
                  onChange={(e) => updateSeg(i, { text: e.target.value })}
                  rows={seg.kind === 'voice' ? 3 : 2}
                  className="w-full p-2 rounded bg-surface border border-border text-sm text-on-surface resize-none"
                  placeholder={seg.kind === 'voice'
                    ? (isRTL ? 'النص الذي سيُنطق' : 'Spoken script')
                    : seg.kind === 'music' ? (isRTL ? 'وصف الموسيقى' : 'Music description')
                    : (isRTL ? 'وصف المؤثر الصوتي' : 'Sound effect description')}
                />
                <div className="flex items-center gap-2 text-xs text-on-surface-tertiary">
                  <span>{isRTL ? 'الصوت:' : 'Volume:'}</span>
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={seg.volume ?? 1}
                    onChange={(e) => updateSeg(i, { volume: Number(e.target.value) })}
                    className="flex-1 accent-accent"
                  />
                  <span className="w-8 text-end">{Math.round((seg.volume ?? 1) * 100)}%</span>
                </div>
              </div>
            );
          })}

          <div className="flex gap-2 pt-2 border-t border-border">
            {(['voice', 'sfx', 'music'] as const).map((k) => {
              const meta = KIND_META[k];
              const Icon = meta.icon;
              return (
                <button
                  key={k}
                  onClick={() => addSegment(k)}
                  className="flex-1 h-9 rounded-[var(--radius)] border border-dashed border-border text-xs text-on-surface-secondary hover:border-accent hover:text-accent flex items-center justify-center gap-1.5"
                >
                  <Plus size={12} /> <Icon size={12} /> {meta.label[language]}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
