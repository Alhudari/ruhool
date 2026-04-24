'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Trash2, CheckCircle2, Circle, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { SaveBar, useSaveBarHeight } from '@/components/settings/save-bar';

type KeyField =
  | 'mapboxToken' | 'maptilerKey' | 'geoapifyKey' | 'thunderforestKey' | 'lumaApiKey'
  | 'elevenlabsApiKey' | 'stableAudioKey' | 'audiocraftLocalUrl'
  | 'groqApiKey';

type KeyInfo = {
  field: KeyField;
  hasFlag:
    | 'hasMapbox' | 'hasMaptiler' | 'hasGeoapify' | 'hasThunderforest' | 'hasLuma'
    | 'hasElevenlabs' | 'hasStableAudio' | 'hasAudiocraft' | 'hasGroq';
  name: { en: string; ar: string };
  description: { en: string; ar: string };
  signupUrl: string;
  signupLabel: { en: string; ar: string };
  free: { en: string; ar: string };
};

const KEYS: KeyInfo[] = [
  {
    field: 'mapboxToken',
    hasFlag: 'hasMapbox',
    name: { en: 'Mapbox', ar: 'Mapbox' },
    description: {
      en: 'High-quality static maps with custom styles. Great for cinematic map shots.',
      ar: 'خرائط ثابتة عالية الجودة بأنماط مخصصة. ممتازة للمشاهد السينمائية.',
    },
    signupUrl: 'https://account.mapbox.com/auth/signup/',
    signupLabel: { en: 'Get Mapbox token', ar: 'احصل على مفتاح Mapbox' },
    free: { en: '50,000 map loads/month free', ar: '٥٠٠٠٠ طلب شهرياً مجاناً' },
  },
  {
    field: 'maptilerKey',
    hasFlag: 'hasMaptiler',
    name: { en: 'MapTiler', ar: 'MapTiler' },
    description: {
      en: 'Vector and satellite tiles with many styles (dark, outdoor, toner).',
      ar: 'خرائط متجهة وأقمار صناعية بأنماط متعددة (داكن، خارجي، أبيض/أسود).',
    },
    signupUrl: 'https://cloud.maptiler.com/account/keys/',
    signupLabel: { en: 'Get MapTiler key', ar: 'احصل على مفتاح MapTiler' },
    free: { en: '100,000 tiles/month free', ar: '١٠٠٠٠٠ tile شهرياً مجاناً' },
  },
  {
    field: 'geoapifyKey',
    hasFlag: 'hasGeoapify',
    name: { en: 'Geoapify', ar: 'Geoapify' },
    description: {
      en: 'Static maps + geocoding + routing. Free tier is generous.',
      ar: 'خرائط ثابتة + geocoding + توجيه. الباقة المجانية سخية.',
    },
    signupUrl: 'https://myprojects.geoapify.com/register',
    signupLabel: { en: 'Get Geoapify key', ar: 'احصل على مفتاح Geoapify' },
    free: { en: '3,000 requests/day free', ar: '٣٠٠٠ طلب يومياً مجاناً' },
  },
  {
    field: 'thunderforestKey',
    hasFlag: 'hasThunderforest',
    name: { en: 'Thunderforest', ar: 'Thunderforest' },
    description: {
      en: 'Beautiful themed OSM-based tiles (transport, outdoors, landscape).',
      ar: 'بلاطات OSM مصمّمة بذوق (نقل، طبيعة، مناظر).',
    },
    signupUrl: 'https://www.thunderforest.com/docs/apikeys/',
    signupLabel: { en: 'Get Thunderforest key', ar: 'احصل على مفتاح Thunderforest' },
    free: { en: '150,000 tiles/month free (hobby plan)', ar: '١٥٠٠٠٠ tile شهرياً مجاناً' },
  },
  {
    field: 'lumaApiKey',
    hasFlag: 'hasLuma',
    name: { en: 'Luma AI (Genie 3D)', ar: 'Luma AI — صورة إلى 3D' },
    description: {
      en: 'Turn a photo of a building or object into a 3D mesh you can animate.',
      ar: 'تحويل صورة مبنى أو كائن إلى نموذج 3D قابل للتحريك.',
    },
    signupUrl: 'https://lumalabs.ai/dream-machine/api',
    signupLabel: { en: 'Get Luma API key', ar: 'احصل على مفتاح Luma' },
    free: { en: 'Free credits on signup, then pay-as-you-go', ar: 'رصيد مجاني عند التسجيل، بعدها دفع حسب الاستخدام' },
  },
  {
    field: 'elevenlabsApiKey',
    hasFlag: 'hasElevenlabs',
    name: { en: 'ElevenLabs (Voice + SFX)', ar: 'ElevenLabs — تعليق صوتي + مؤثرات' },
    description: {
      en: 'Arabic voice-over (TTS) + text-to-sound-effects. One key covers both.',
      ar: 'تعليق صوتي عربي + توليد مؤثرات صوتية من نص. مفتاح واحد يغطّي الاثنين.',
    },
    signupUrl: 'https://elevenlabs.io/app/settings/api-keys',
    signupLabel: { en: 'Get ElevenLabs key', ar: 'احصل على مفتاح ElevenLabs' },
    free: { en: '10k characters/month free (~200 short SFX)', ar: '١٠٠٠٠ حرف شهرياً مجاناً (≈٢٠٠ SFX)' },
  },
  {
    field: 'stableAudioKey',
    hasFlag: 'hasStableAudio',
    name: { en: 'Stable Audio (Stability AI)', ar: 'Stable Audio — موسيقى' },
    description: {
      en: 'Generate background music and longer audio loops from a text prompt.',
      ar: 'توليد موسيقى خلفية وحلقات صوتية طويلة من وصف نصي.',
    },
    signupUrl: 'https://platform.stability.ai/account/keys',
    signupLabel: { en: 'Get key from Stability AI platform', ar: 'احصل على المفتاح من منصة Stability AI' },
    free: { en: '25 free credits on signup (~2-3 tracks)', ar: '٢٥ رصيد مجاني عند التسجيل (≈ ٢-٣ مقاطع)' },
  },
  {
    field: 'groqApiKey',
    hasFlag: 'hasGroq',
    name: { en: 'Groq (Whisper ASR)', ar: 'Groq — تفريغ صوتي' },
    description: {
      en: 'Ultra-fast speech-to-text with word-level timestamps. Used for auto-captions.',
      ar: 'تحويل الصوت إلى نص عربي سريع جداً، مع توقيت لكل كلمة. يُستخدم للكابشنز التلقائية.',
    },
    signupUrl: 'https://console.groq.com/keys',
    signupLabel: { en: 'Get Groq API key', ar: 'احصل على مفتاح Groq' },
    free: { en: '14,400 requests/day free', ar: '١٤٤٠٠ طلب يومياً مجاناً' },
  },
  {
    field: 'audiocraftLocalUrl',
    hasFlag: 'hasAudiocraft',
    name: { en: 'AudioCraft (local, free)', ar: 'AudioCraft — محلي مجاني' },
    description: {
      en: 'Meta\'s open-source audio generator running on your own machine. Point to http://localhost:PORT.',
      ar: 'مولّد صوتي مفتوح من Meta يشتغل على جهازك. ضع عنوان http://localhost:PORT.',
    },
    signupUrl: 'https://github.com/facebookresearch/audiocraft',
    signupLabel: { en: 'Install AudioCraft locally', ar: 'تثبيت AudioCraft محلياً' },
    free: { en: '100% free — runs on your GPU', ar: 'مجاني بالكامل — يشتغل على GPU جهازك' },
  },
];

type KeyState = Record<string, string> & {
  hasMapbox?: boolean; hasMaptiler?: boolean; hasGeoapify?: boolean;
  hasThunderforest?: boolean; hasLuma?: boolean;
};

const emptyDrafts = (): Record<KeyField, string> => ({
  mapboxToken: '', maptilerKey: '', geoapifyKey: '', thunderforestKey: '', lumaApiKey: '',
  elevenlabsApiKey: '', stableAudioKey: '', audiocraftLocalUrl: '', groqApiKey: '',
});

export function ExternalApisSettings() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [keys, setKeys] = useState<KeyState>({});
  const [drafts, setDrafts] = useState<Record<KeyField, string>>(emptyDrafts());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearingField, setClearingField] = useState<KeyField | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState<KeyField | null>(null);
  const [capabilities, setCapabilities] = useState<Record<string, { ok: boolean; capabilities: Record<string, { ok: boolean; message: string }> }>>({});
  const [costTier, setCostTierState] = useState<'zero-cost' | 'saving' | 'medium' | 'max'>('saving');

  const saveCostTier = async (tier: typeof costTier) => {
    setCostTierState(tier);
    try { await apiFetch('/api/settings/cost-tier', { method: 'PUT', body: JSON.stringify({ tier }) }); } catch {}
  };

  const checkCapability = async (field: KeyField) => {
    setChecking(field);
    try {
      const r = await apiFetch<{ ok: boolean; capabilities: Record<string, { ok: boolean; message: string }> }>(`/api/settings/api-keys/${field}/check`, { method: 'POST' });
      setCapabilities((prev) => ({ ...prev, [field]: r }));
    } catch {
      /* ignore */
    } finally {
      setChecking(null);
    }
  };

  const checkAll = async () => {
    try {
      const r = await apiFetch<Record<string, { ok: boolean; capabilities: Record<string, { ok: boolean; message: string }> }>>('/api/settings/api-keys/capabilities');
      setCapabilities(r);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    apiFetch<KeyState>('/api/settings/api-keys')
      .then((d) => { setKeys(d); checkAll(); })
      .catch(() => {})
      .finally(() => setLoading(false));
    apiFetch<{ tier: typeof costTier }>('/api/settings/cost-tier').then((r) => setCostTierState(r.tier)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingFields = (Object.keys(drafts) as KeyField[]).filter((f) => drafts[f].trim().length > 0);
  const dirty = pendingFields.length > 0;
  useUnsavedChanges(dirty);
  const saveBarPad = useSaveBarHeight(dirty || !!successMessage);

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const payload: Partial<Record<KeyField, string>> = {};
      for (const f of pendingFields) payload[f] = drafts[f].trim();
      await apiFetch('/api/settings/api-keys', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      const fresh = await apiFetch<KeyState>('/api/settings/api-keys');
      setKeys(fresh);
      setDrafts(emptyDrafts());
      checkAll();
      setSuccessMessage(
        isRTL
          ? `حُفظ ${pendingFields.length} ${pendingFields.length === 1 ? 'مفتاح' : 'مفاتيح'}`
          : `Saved ${pendingFields.length} ${pendingFields.length === 1 ? 'key' : 'keys'}`
      );
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : (isRTL ? 'فشل الحفظ' : 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setDrafts(emptyDrafts());
    setErrorMessage(null);
  };

  const clear = async (field: KeyField) => {
    if (!window.confirm(isRTL ? 'حذف هذا المفتاح؟' : 'Remove this key?')) return;
    setClearingField(field);
    try {
      await apiFetch(`/api/settings/api-keys/${field}`, { method: 'DELETE' });
      const fresh = await apiFetch<KeyState>('/api/settings/api-keys');
      setKeys(fresh);
    } catch {
      /* ignore */
    } finally {
      setClearingField(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const TIERS: { id: typeof costTier; label: { ar: string; en: string }; desc: { ar: string; en: string } }[] = [
    { id: 'zero-cost', label: { ar: 'صفر تكلفة', en: 'Zero cost' },    desc: { ar: 'مجاني فقط، لا خدمات مدفوعة', en: 'Free only, no paid services' } },
    { id: 'saving',    label: { ar: 'توفير',    en: 'Saving' },       desc: { ar: 'الباقات المجانية + موديلات سريعة رخيصة', en: 'Free tiers + cheap fast models' } },
    { id: 'medium',    label: { ar: 'متوسط',    en: 'Medium' },       desc: { ar: 'جودة جيدة مع كل الخدمات', en: 'Good quality with all services' } },
    { id: 'max',       label: { ar: 'أعلى',     en: 'Max quality' },  desc: { ar: 'أفضل جودة بغض النظر عن التكلفة', en: 'Best quality regardless of cost' } },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-on-surface mb-1">
          {isRTL ? 'واجهات API خارجية' : 'External APIs'}
        </h2>
        <p className="text-sm text-on-surface-secondary">
          {isRTL
            ? 'مفاتيح اختيارية لتفعيل الخدمات المتقدمة في الاستديو (خرائط عالية الجودة، تحويل صورة إلى 3D، تفريغ صوتي). كلها لها باقة مجانية.'
            : 'Optional keys to unlock advanced studio features (premium maps, photo→3D, transcription). All have free tiers.'}
        </p>
      </div>

      {/* Cost tier selector */}
      <div className="rounded-[var(--radius-lg)] border border-accent/30 bg-accent/5 p-4">
        <h3 className="text-sm font-semibold text-on-surface mb-1">
          {isRTL ? 'مستوى التكلفة' : 'Cost tier'}
        </h3>
        <p className="text-xs text-on-surface-secondary mb-3">
          {isRTL
            ? 'يحدّد أي خدمات تُستخدم افتراضياً في كل عملية تصيير.'
            : 'Controls which services are used by default on every render.'}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {TIERS.map((t) => (
            <button
              key={t.id}
              onClick={() => saveCostTier(t.id)}
              className={cn(
                'p-3 rounded-[var(--radius)] border text-start transition-all',
                costTier === t.id
                  ? 'border-accent bg-accent/10 shadow-sm'
                  : 'border-border bg-surface hover:border-accent/40'
              )}
            >
              <div className="flex items-center gap-2">
                <div className={cn(
                  'w-3 h-3 rounded-full',
                  costTier === t.id ? 'bg-accent' : 'bg-surface-secondary border border-border'
                )} />
                <span className="text-sm font-semibold text-on-surface">{t.label[language]}</span>
              </div>
              <p className="text-[11px] text-on-surface-tertiary mt-1">{t.desc[language]}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {KEYS.map((k) => {
          const connected = !!keys[k.hasFlag];
          const masked = keys[k.field] as string | undefined;
          const rowPending = drafts[k.field].trim().length > 0;
          return (
            <div
              key={k.field}
              className="rounded-[var(--radius-lg)] border border-border p-4 space-y-3 bg-surface"
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  'mt-0.5 shrink-0',
                  !connected ? 'text-on-surface-tertiary'
                    : capabilities[k.field]?.ok ? 'text-success'
                    : capabilities[k.field] && !capabilities[k.field].ok ? 'text-warning'
                    : 'text-success'
                )}>
                  {!connected ? <Circle size={18} />
                    : capabilities[k.field] && !capabilities[k.field].ok ? <AlertTriangle size={18} />
                    : <CheckCircle2 size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-on-surface">{k.name[language]}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success font-medium">
                      {k.free[language]}
                    </span>
                    {connected && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium">
                        {isRTL ? 'متصل' : 'Connected'}
                      </span>
                    )}
                    {rowPending && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/15 text-warning font-medium">
                        {isRTL ? 'غير محفوظ' : 'Unsaved'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-secondary mt-1">{k.description[language]}</p>
                  <a
                    href={k.signupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline mt-2"
                  >
                    <ExternalLink size={12} />
                    {k.signupLabel[language]}
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={drafts[k.field]}
                  onChange={(e) => setDrafts((d) => ({ ...d, [k.field]: e.target.value }))}
                  placeholder={
                    connected && masked
                      ? masked
                      : isRTL ? 'الصق المفتاح هنا…' : 'Paste key here…'
                  }
                  className="flex-1 h-9 px-3 rounded-[var(--radius)] bg-surface-secondary border border-border text-sm text-on-surface font-mono"
                />
                {connected && (
                  <button
                    onClick={() => clear(k.field)}
                    disabled={clearingField === k.field}
                    className="h-9 px-3 rounded-[var(--radius)] border border-border text-on-surface-tertiary hover:bg-error/10 hover:text-error hover:border-error/40 transition-colors disabled:opacity-50"
                    title={isRTL ? 'حذف المفتاح' : 'Remove key'}
                  >
                    {clearingField === k.field ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
              </div>

              {connected && (
                <div className="pt-2 border-t border-border">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-on-surface-secondary">
                      {isRTL ? 'حالة الخدمات' : 'Service status'}
                    </span>
                    <button
                      onClick={() => checkCapability(k.field)}
                      disabled={checking === k.field}
                      className="text-[11px] text-accent hover:underline flex items-center gap-1"
                    >
                      {checking === k.field ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                      {isRTL ? 'تحقّق' : 'Check'}
                    </button>
                  </div>
                  {capabilities[k.field] ? (
                    <div className="space-y-1">
                      {Object.entries(capabilities[k.field].capabilities).map(([capKey, cap]) => (
                        <div key={capKey} className={cn(
                          'text-[11px] flex items-start gap-1.5 p-1.5 rounded',
                          cap.ok ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                        )}>
                          {cap.ok ? <CheckCircle2 size={10} className="mt-0.5 shrink-0" /> : <AlertTriangle size={10} className="mt-0.5 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <span className="font-mono font-semibold">{capKey}:</span> <span>{cap.message}</span>
                          </div>
                        </div>
                      ))}
                      {Object.values(capabilities[k.field].capabilities).every((c) => !c.ok) && (
                        <a href={k.signupUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-warning hover:underline">
                          {isRTL ? '← افتح لوحة التحكم لتفعيل الخدمات' : '← Open dashboard to enable services'}
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-on-surface-tertiary">
                      {isRTL ? 'اضغط "تحقّق" لاختبار المفتاح' : 'Click "Check" to test the key'}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-xs text-on-surface-tertiary border-t border-border pt-4">
        {isRTL
          ? 'ملاحظة: المفاتيح تُحفظ محلياً على جهازك فقط. لا تُرسل لأي خدمة خارج الخدمة المقصودة.'
          : 'Note: keys are stored locally on your machine only. They are never sent anywhere except the intended service.'}
      </div>

      <div style={{ height: saveBarPad }} aria-hidden="true" />

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={save}
        onDiscard={discard}
        successMessage={successMessage}
        errorMessage={errorMessage}
      />
    </div>
  );
}
