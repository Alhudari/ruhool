'use client';

import { useState } from 'react';
import { Sparkles, Film, Pencil, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ───

export type IntakeVideoType = 'reel' | 'story' | 'square' | 'landscape' | string;
export type IntakeDuration = number;
export type IntakeAudio = 'silent' | 'voice_ar' | 'music' | 'voice_music' | string;

export interface IntakeResult {
  format: 'reel' | 'landscape' | 'square';
  duration: IntakeDuration;
  prompt: string;
}

interface Props {
  isRTL: boolean;
  defaultDuration?: IntakeDuration;
  onSubmit: (result: IntakeResult) => void;
  onSkip: () => void;
  /** Show as an agent message bubble (when presented in chat) */
  asAgentMessage?: boolean;
  agentName?: string;
}

// ─── Base option definitions (bilingual) ───

interface Option { id: string; ar: string; en: string; meta?: Record<string, string> }

const VIDEO_TYPES_BASE: (Option & { size: string })[] = [
  { id: 'reel',      ar: 'ريل',       en: 'Reel',         size: '1080x1920' },
  { id: 'story',     ar: 'قصة',       en: 'Story',        size: '1080x1920' },
  { id: 'square',    ar: 'بوست مربع',  en: 'Square post',  size: '1080x1080' },
  { id: 'landscape', ar: 'لاندسكيب',  en: 'Landscape',    size: '1920x1080' },
];

const DURATIONS_BASE: number[] = [5, 15, 30, 60];

const GOALS_BASE: Option[] = [
  { id: 'explain',       ar: 'شرح موضوع', en: 'Explain' },
  { id: 'promote',       ar: 'ترويج',     en: 'Promote' },
  { id: 'educational',   ar: 'تعليمي',    en: 'Educational' },
  { id: 'entertainment', ar: 'ترفيهي',    en: 'Entertainment' },
  { id: 'ad',            ar: 'إعلان',     en: 'Ad' },
];

const STYLES_BASE: Option[] = [
  { id: 'warm',      ar: 'ألوان دافئة',     en: 'Warm colors' },
  { id: 'cool',      ar: 'ألوان باردة',     en: 'Cool colors' },
  { id: 'fast',      ar: 'حركة سريعة',      en: 'Fast motion' },
  { id: 'cinematic', ar: 'بطيء سينمائي',   en: 'Cinematic slow' },
  { id: 'technical', ar: 'تقني',           en: 'Technical' },
  { id: 'playful',   ar: 'مرح',            en: 'Playful' },
  { id: 'minimal',   ar: 'بسيط نظيف',      en: 'Minimal clean' },
  { id: 'bold',      ar: 'جريء وملوّن',     en: 'Bold & colorful' },
];

const FEATURES_BASE: Option[] = [
  { id: 'kuwait_map',  ar: 'خريطة الكويت',  en: 'Kuwait map' },
  { id: 'chart',       ar: 'شارت بياني',    en: 'Data chart' },
  { id: 'building_3d', ar: 'مبنى 3D',       en: '3D building' },
  { id: 'text_fx',     ar: 'ميزات نص',      en: 'Text effects' },
  { id: 'ifc',         ar: 'نموذج BIM/IFC', en: 'BIM/IFC model' },
  { id: 'captions',    ar: 'كابشنز تلقائية', en: 'Auto captions' },
  { id: 'logo',        ar: 'شعار متحرك',    en: 'Animated logo' },
];

const AUDIO_BASE: Option[] = [
  { id: 'silent',      ar: 'بدون صوت',           en: 'Silent' },
  { id: 'voice_ar',    ar: 'تعليق صوتي عربي',    en: 'Arabic voice-over' },
  { id: 'music',       ar: 'موسيقى فقط',         en: 'Music only' },
  { id: 'voice_music', ar: 'تعليق + موسيقى',    en: 'Voice + music' },
  { id: 'sfx',         ar: 'مؤثرات صوتية فقط',  en: 'SFX only' },
];

// ─── Helpers ───

function mapTypeToFormat(typeId: string): 'reel' | 'landscape' | 'square' {
  if (typeId === 'landscape') return 'landscape';
  if (typeId === 'square') return 'square';
  return 'reel';
}

function labelOf(opts: Option[], id: string, lang: 'ar' | 'en'): string {
  const found = opts.find((o) => o.id === id);
  return found ? found[lang] : id;
}

// ─── AddCustom inline input ───

function AddChip({ isRTL, onAdd, placeholder }: { isRTL: boolean; onAdd: (v: string) => void; placeholder: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-border text-on-surface-secondary hover:border-rose-400 hover:text-rose-500 flex items-center gap-1"
      >
        <Plus size={12} /> {isRTL ? 'إضافة' : 'Add'}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && val.trim()) { onAdd(val.trim()); setVal(''); setEditing(false); }
          else if (e.key === 'Escape') { setVal(''); setEditing(false); }
        }}
        placeholder={placeholder}
        className="h-7 px-2 rounded-md bg-surface-secondary border border-rose-400 text-xs text-on-surface w-32"
      />
      <button
        type="button"
        onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal(''); } setEditing(false); }}
        className="h-7 px-2 rounded-md text-xs bg-rose-500 text-white"
      >{isRTL ? 'تم' : 'OK'}</button>
      <button type="button" onClick={() => { setVal(''); setEditing(false); }} className="h-7 w-7 rounded-md text-on-surface-tertiary hover:bg-surface-secondary flex items-center justify-center">
        <X size={12} />
      </button>
    </div>
  );
}

function buildPrompt(opts: {
  typeId: string;
  typeLabel: string;
  typeSize: string;
  duration: number;
  topic: string;
  goals: string[];
  styles: string[];
  features: string[];
  audio: string;
  audioLabel: string;
  extraNotes: string;
}): string {
  const goalsStr = opts.goals.length ? opts.goals.join('، ') : 'غير محدد';
  const styleStr = opts.styles.length ? opts.styles.join('، ') : 'حر';
  const featuresStr = opts.features.length ? opts.features.join('، ') : 'لا يوجد';
  const notes = opts.extraNotes.trim() ? `\n- ملاحظات إضافية: ${opts.extraNotes.trim()}` : '';

  return `هذه هي معطياتي الأولية لفيديو جديد:
- نوع الفيديو: ${opts.typeLabel} (${opts.typeSize})
- المدة: ${opts.duration} ثانية
- الموضوع: ${opts.topic}
- الغرض: ${goalsStr}
- الأسلوب: ${styleStr}
- عناصر مطلوبة: ${featuresStr}
- الصوت: ${opts.audioLabel}${notes}

**لا تكتب كود مباشرة.** ابدأ بمناقشة الفكرة معي:
1. اطرح عليّ 2-4 أسئلة توضيحية مهمة (مثل: ما الزاوية أو الرسالة الرئيسية؟ جمهور محدد؟ أمثلة تعجبني؟ لهجة؟).
2. انتظر جوابي.
3. بعدها اكتب ستوري بورد مفصّل بالتنسيق المعتمد (مشاهد مرقّمة مع التوقيتات).
4. انتظر تأكيدي أو تعديلاتي على الستوري بورد.
5. بعد الاعتماد فقط، اكتب كود Remotion.`;
}

// ─── Component ───

export function CreativeIntakeForm({ isRTL, defaultDuration = 30, onSubmit, onSkip, asAgentMessage = false, agentName = 'الكرييتف' }: Props) {
  // Extensible option lists
  const [videoTypes, setVideoTypes] = useState(VIDEO_TYPES_BASE);
  const [durations, setDurations] = useState<number[]>(DURATIONS_BASE);
  const [goalsOpts, setGoalsOpts] = useState(GOALS_BASE);
  const [stylesOpts, setStylesOpts] = useState(STYLES_BASE);
  const [featuresOpts, setFeaturesOpts] = useState(FEATURES_BASE);
  const [audioOpts, setAudioOpts] = useState(AUDIO_BASE);

  // Selections
  const [type, setType] = useState<string>('reel');
  const [duration, setDuration] = useState<number>(defaultDuration);
  const [goals, setGoals] = useState<string[]>([]);
  const [topic, setTopic] = useState('');
  const [styles, setStyles] = useState<string[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const [audio, setAudio] = useState<string>('voice_music');
  const [extraNotes, setExtraNotes] = useState('');

  const toggle = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  const addCustomOption = (setter: React.Dispatch<React.SetStateAction<Option[]>>, value: string, selectSetter?: (fn: (arr: string[]) => string[]) => void) => {
    const id = 'custom_' + value.replace(/\s+/g, '_').toLowerCase();
    setter((arr) => arr.some((o) => o.id === id) ? arr : [...arr, { id, ar: value, en: value }]);
    if (selectSetter) selectSetter((arr) => arr.includes(id) ? arr : [...arr, id]);
  };

  const canSubmit = topic.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const typeOpt = videoTypes.find((v) => v.id === type);
    const audioOpt = audioOpts.find((a) => a.id === audio);
    const prompt = buildPrompt({
      typeId: type,
      typeLabel: typeOpt ? (isRTL ? typeOpt.ar : typeOpt.en) : type,
      typeSize: typeOpt?.size || '1080x1920',
      duration,
      topic: topic.trim(),
      goals: goals.map((g) => labelOf(goalsOpts, g, 'ar')),
      styles: styles.map((s) => labelOf(stylesOpts, s, 'ar')),
      features: features.map((f) => labelOf(featuresOpts, f, 'ar')),
      audio,
      audioLabel: audioOpt ? audioOpt.ar : audio,
      extraNotes,
    });
    onSubmit({ format: mapTypeToFormat(type), duration, prompt });
  };

  // ─── Field rendering helpers ───

  const sectionClass = 'space-y-2';
  const labelClass = cn('text-xs font-semibold text-on-surface-secondary', isRTL && 'text-right');
  const gridClass = 'flex flex-wrap gap-2';
  const chip = (active: boolean) => cn(
    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors select-none',
    active
      ? 'bg-rose-500 text-white border-rose-500'
      : 'bg-surface-secondary text-on-surface border-border hover:border-rose-400'
  );

  return (
    <div
      className={cn(
        'w-full max-w-2xl rounded-2xl border bg-surface p-5 space-y-5 shadow-sm',
        asAgentMessage ? 'border-rose-500/30 bg-rose-500/5 me-auto' : 'border-border mx-auto',
        isRTL && 'text-right'
      )}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className={cn('flex items-start gap-2', isRTL && 'flex-row-reverse')}>
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center text-white shrink-0">
          <Sparkles size={16} />
        </div>
        <div className={cn('flex-1', isRTL && 'text-right')}>
          <p className="text-sm font-semibold text-on-surface">
            {isRTL ? `${agentName}:` : `${agentName}:`}
          </p>
          <p className="text-sm text-on-surface mt-1">
            {isRTL
              ? `أهلاً! عشان أبدع لك فيديو يناسبك، ساعدني أعرف أكثر. اختر من الخيارات أو ضع «إضافة» لتضيف شي جديد من عندك.`
              : `Hi! To craft the right video for you, help me know more. Pick from the options or hit "Add" for your own.`}
          </p>
        </div>
      </div>

      {/* Video type */}
      <div className={sectionClass}>
        <p className={labelClass}>{isRTL ? 'نوع الفيديو' : 'Video type'}</p>
        <div className={gridClass}>
          {videoTypes.map((v) => (
            <button key={v.id} type="button" onClick={() => setType(v.id)} className={chip(type === v.id)}>
              {isRTL ? `${v.ar} (${v.size})` : `${v.en} (${v.size})`}
            </button>
          ))}
          <AddChip
            isRTL={isRTL}
            placeholder={isRTL ? 'مثل: سكوير X (900x900)' : 'e.g. Square X (900x900)'}
            onAdd={(v) => {
              const id = 'custom_' + v.replace(/\s+/g, '_').toLowerCase();
              const parts = v.match(/(.*?)\s*\(([^)]+)\)/);
              const name = parts?.[1]?.trim() || v;
              const size = parts?.[2]?.trim() || '1080x1920';
              setVideoTypes((arr) => arr.some((o) => o.id === id) ? arr : [...arr, { id, ar: name, en: name, size }]);
              setType(id);
            }}
          />
        </div>
      </div>

      {/* Duration */}
      <div className={sectionClass}>
        <p className={labelClass}>{isRTL ? 'المدة' : 'Duration'}</p>
        <div className={gridClass}>
          {durations.map((d) => (
            <button key={d} type="button" onClick={() => setDuration(d)} className={chip(duration === d)}>
              {d}s
            </button>
          ))}
          <AddChip
            isRTL={isRTL}
            placeholder={isRTL ? 'ثواني (مثل 45)' : 'seconds (e.g. 45)'}
            onAdd={(v) => {
              const n = parseInt(v);
              if (!isNaN(n) && n > 0 && n <= 300) {
                setDurations((arr) => arr.includes(n) ? arr : [...arr, n].sort((a, b) => a - b));
                setDuration(n);
              }
            }}
          />
        </div>
      </div>

      {/* Goal */}
      <div className={sectionClass}>
        <p className={labelClass}>{isRTL ? 'الغرض' : 'Goal'}</p>
        <div className={gridClass}>
          {goalsOpts.map((g) => (
            <button key={g.id} type="button" onClick={() => setGoals((arr) => toggle(arr, g.id))} className={chip(goals.includes(g.id))}>
              {isRTL ? g.ar : g.en}
            </button>
          ))}
          <AddChip isRTL={isRTL} placeholder={isRTL ? 'غرض جديد' : 'New goal'} onAdd={(v) => addCustomOption(setGoalsOpts, v, setGoals as any)} />
        </div>
      </div>

      {/* Topic */}
      <div className={sectionClass}>
        <p className={labelClass}>{isRTL ? 'الموضوع *' : 'Topic *'}</p>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={isRTL ? 'مثل: BIM في الكويت' : 'e.g. BIM in Kuwait'}
          className={cn('w-full rounded-xl px-4 py-2.5 text-sm bg-surface-secondary text-on-surface placeholder:text-on-surface-tertiary border border-border focus:border-accent focus:outline-none', isRTL && 'text-right')}
        />
      </div>

      {/* Style */}
      <div className={sectionClass}>
        <p className={labelClass}>{isRTL ? 'الأسلوب' : 'Style'}</p>
        <div className={gridClass}>
          {stylesOpts.map((s) => (
            <button key={s.id} type="button" onClick={() => setStyles((arr) => toggle(arr, s.id))} className={chip(styles.includes(s.id))}>
              {isRTL ? s.ar : s.en}
            </button>
          ))}
          <AddChip isRTL={isRTL} placeholder={isRTL ? 'أسلوب جديد' : 'New style'} onAdd={(v) => addCustomOption(setStylesOpts, v, setStyles as any)} />
        </div>
      </div>

      {/* Features */}
      <div className={sectionClass}>
        <p className={labelClass}>{isRTL ? 'عناصر مرئية' : 'Visual features'}</p>
        <div className={gridClass}>
          {featuresOpts.map((f) => (
            <button key={f.id} type="button" onClick={() => setFeatures((arr) => toggle(arr, f.id))} className={chip(features.includes(f.id))}>
              {isRTL ? f.ar : f.en}
            </button>
          ))}
          <AddChip isRTL={isRTL} placeholder={isRTL ? 'عنصر جديد' : 'New feature'} onAdd={(v) => addCustomOption(setFeaturesOpts, v, setFeatures as any)} />
        </div>
      </div>

      {/* Audio */}
      <div className={sectionClass}>
        <p className={labelClass}>{isRTL ? 'الصوت' : 'Audio'}</p>
        <div className={gridClass}>
          {audioOpts.map((a) => (
            <button key={a.id} type="button" onClick={() => setAudio(a.id)} className={chip(audio === a.id)}>
              {isRTL ? a.ar : a.en}
            </button>
          ))}
          <AddChip isRTL={isRTL} placeholder={isRTL ? 'نوع صوت جديد' : 'New audio type'} onAdd={(v) => { addCustomOption(setAudioOpts, v); setAudio('custom_' + v.replace(/\s+/g, '_').toLowerCase()); }} />
        </div>
      </div>

      {/* Extra free-text notes */}
      <div className={sectionClass}>
        <p className={labelClass}>{isRTL ? 'ملاحظات إضافية (اختياري)' : 'Extra notes (optional)'}</p>
        <textarea
          value={extraNotes}
          onChange={(e) => setExtraNotes(e.target.value)}
          rows={2}
          placeholder={isRTL ? 'أي تفاصيل أو قيود أو مراجع…' : 'Any details, constraints, or references…'}
          className={cn('w-full rounded-xl px-4 py-2.5 text-sm bg-surface-secondary text-on-surface placeholder:text-on-surface-tertiary border border-border focus:border-accent focus:outline-none resize-none', isRTL && 'text-right')}
        />
      </div>

      {/* Actions */}
      <div className={cn('flex items-center gap-3 pt-2', isRTL && 'flex-row-reverse')}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn('flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors',
            canSubmit ? 'bg-rose-500 text-white hover:bg-rose-600' : 'bg-surface-tertiary text-on-surface-tertiary cursor-not-allowed')}
        >
          <Film size={14} />
          {isRTL ? 'أرسل للكرييتف' : 'Send to Creative'}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-on-surface-secondary hover:text-on-surface hover:bg-surface-secondary transition-colors"
        >
          <Pencil size={12} />
          {isRTL ? 'أكتب حراً بدون هالنموذج' : 'Free text instead'}
        </button>
      </div>
    </div>
  );
}
