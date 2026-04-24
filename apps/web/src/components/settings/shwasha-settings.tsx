'use client';

import { useEffect, useState } from 'react';
import { Loader2, BookOpen, Cpu, AlertCircle, Plug, FileText, Library } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { SaveBar, useSaveBarHeight } from '@/components/settings/save-bar';

type ConnStatus = 'idle' | 'testing' | 'ok' | 'error';
interface ConnState {
  status: ConnStatus;
  error?: string;
  hint?: string;
  detail?: string;
}

interface ZoteroTestResponse {
  ok: boolean;
  sampleCount?: number;
  version?: string;
  error?: string;
  hint?: string;
}

interface ObsidianTestResponse {
  ok: boolean;
  vaultFolder?: string;
  files?: number;
  error?: string;
  hint?: string;
}

interface ShwashaSettings {
  mindBlock: string;
  agentIntegrations: string;
  defaultLanguage: 'en' | 'ar';
  ollamaEnabled: boolean;
  ollamaBaseUrl: string;
}

const EMPTY: ShwashaSettings = {
  mindBlock: '',
  agentIntegrations: '',
  defaultLanguage: 'en',
  ollamaEnabled: false,
  ollamaBaseUrl: 'http://localhost:11434',
};

export function ShwashaSettings() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [initial, setInitial] = useState<ShwashaSettings>(EMPTY);
  const [state, setState] = useState<ShwashaSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [zoteroConn, setZoteroConn] = useState<ConnState>({ status: 'idle' });
  const [obsidianConn, setObsidianConn] = useState<ConnState>({ status: 'idle' });

  const testZotero = async () => {
    setZoteroConn({ status: 'testing' });
    try {
      const res = await apiFetch<ZoteroTestResponse>('/api/shwasha/test/zotero');
      if (res.ok) {
        setZoteroConn({
          status: 'ok',
          detail:
            typeof res.sampleCount === 'number'
              ? (isRTL ? `عينات: ${res.sampleCount}` : `items: ${res.sampleCount}`)
              : undefined,
        });
      } else {
        setZoteroConn({ status: 'error', error: res.error, hint: res.hint });
      }
    } catch (e) {
      setZoteroConn({ status: 'error', error: e instanceof Error ? e.message : 'Test failed' });
    }
  };

  const testObsidian = async () => {
    setObsidianConn({ status: 'testing' });
    try {
      const res = await apiFetch<ObsidianTestResponse>('/api/shwasha/test/obsidian');
      if (res.ok) {
        setObsidianConn({
          status: 'ok',
          detail: res.vaultFolder
            ? (isRTL ? `المجلد: ${res.vaultFolder}` : `folder: ${res.vaultFolder}`)
            : undefined,
        });
      } else {
        setObsidianConn({ status: 'error', error: res.error, hint: res.hint });
      }
    } catch (e) {
      setObsidianConn({ status: 'error', error: e instanceof Error ? e.message : 'Test failed' });
    }
  };

  useEffect(() => {
    apiFetch<Partial<ShwashaSettings>>('/api/shwasha/settings')
      .then((s) => {
        const merged: ShwashaSettings = {
          mindBlock: s.mindBlock ?? '',
          agentIntegrations: s.agentIntegrations ?? '',
          defaultLanguage: s.defaultLanguage === 'ar' ? 'ar' : 'en',
          ollamaEnabled: s.ollamaEnabled ?? false,
          ollamaBaseUrl: s.ollamaBaseUrl ?? 'http://localhost:11434',
        };
        setInitial(merged);
        setState(merged);
      })
      .catch((e) => setErrorMessage(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const dirty =
    state.mindBlock !== initial.mindBlock ||
    state.agentIntegrations !== initial.agentIntegrations ||
    state.defaultLanguage !== initial.defaultLanguage ||
    state.ollamaEnabled !== initial.ollamaEnabled ||
    state.ollamaBaseUrl !== initial.ollamaBaseUrl;

  useUnsavedChanges(dirty);
  const saveBarPad = useSaveBarHeight(dirty || !!successMessage);

  const urlChanged = state.ollamaBaseUrl !== initial.ollamaBaseUrl;

  const handleSave = async () => {
    setSaving(true);
    setErrorMessage(null);
    try {
      await apiFetch('/api/shwasha/settings', {
        method: 'PUT',
        body: JSON.stringify(state),
      });
      setInitial(state);
      setSuccessMessage(isRTL ? 'حُفظ' : 'Saved');
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : (isRTL ? 'فشل الحفظ' : 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setState(initial);
    setErrorMessage(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-on-surface-tertiary">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <BookOpen size={18} className="text-accent" />
          <h2 className="text-lg font-medium text-on-surface">
            {isRTL ? 'المُلخِّص — رفيق القراءة' : 'Al-Mulakhkhis — Reading Companion'}
          </h2>
        </div>
        <p className="text-sm text-on-surface-secondary">
          {isRTL
            ? 'الإعدادات الافتراضية لجلسات المُلخِّص. يمكنك تجاوزها في كل جلسة قراءة.'
            : 'Default settings for Al-Mulakhkhis reading sessions. You can override them per session.'}
        </p>
      </div>


      <div className="space-y-2">
        <label className="text-sm font-medium text-on-surface">
          {isRTL ? 'ما الذي يضعه المُلخِّص في الحسبان أثناء التحليل' : 'What Al-Mulakhkhis keeps in mind when analyzing'}
        </label>
        <p className="text-xs text-on-surface-tertiary">
          {isRTL
            ? 'سياقك البحثي، تخصصك، تفضيلاتك — ما تريد أن يتذكره المُلخِّص في كل قراءة.'
            : 'Your research context, discipline, preferences — what Al-Mulakhkhis should keep in mind every time you read.'}
        </p>
        <textarea
          value={state.mindBlock}
          onChange={(e) => setState((s) => ({ ...s, mindBlock: e.target.value }))}
          rows={6}
          dir="auto"
          placeholder={
            isRTL
              ? 'مثلاً: أنا أبحث في تبني BIM لدى المقاولين في الكويت...'
              : 'e.g. I am researching BIM adoption among contractors in Kuwait...'
          }
          className="w-full px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring resize-y leading-relaxed"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-on-surface">
          {isRTL ? 'كيف يعمل المُلخِّص مع الوكلاء الآخرين' : 'How Al-Mulakhkhis works with other agents'}
        </label>
        <p className="text-xs text-on-surface-tertiary">
          {isRTL
            ? 'ينمو هذا القسم مع الوقت كلما أضفت تكاملات جديدة. صف العلاقات والحدود.'
            : 'This section grows over time as you add integrations. Describe the relationships and boundaries.'}
        </p>
        <textarea
          value={state.agentIntegrations}
          onChange={(e) => setState((s) => ({ ...s, agentIntegrations: e.target.value }))}
          rows={6}
          dir="auto"
          placeholder={
            isRTL
              ? 'مثلاً: اطلب من الباحث التحقق من الاقتباسات؛ من الناقد مراجعة أسلوب الكتابة...'
              : 'e.g. Ask Al-Bahith to verify citations; ask Al-Naqid to review writing style...'
          }
          className="w-full px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring resize-y leading-relaxed font-mono"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-on-surface">
          {isRTL ? 'لغة الرد الافتراضية' : 'Default response language'}
        </label>
        <p className="text-xs text-on-surface-tertiary">
          {isRTL ? 'قابلة للتجاوز في كل جلسة.' : 'Overridable per session.'}
        </p>
        <div className="flex gap-2">
          {([
            { id: 'en' as const, label: 'English' },
            { id: 'ar' as const, label: 'العربية' },
          ]).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setState((s) => ({ ...s, defaultLanguage: opt.id }))}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm border transition-colors',
                state.defaultLanguage === opt.id
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-on-surface-secondary hover:bg-surface-secondary'
              )}
            >
              <span
                className={cn(
                  'w-3.5 h-3.5 rounded-full border-2',
                  state.defaultLanguage === opt.id ? 'border-accent bg-accent' : 'border-on-surface-tertiary'
                )}
              />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-accent" />
          <h3 className="text-sm font-medium text-on-surface">
            {isRTL ? 'التوجيه الهجين (محلي + سحابي)' : 'Hybrid Routing (local + cloud)'}
          </h3>
        </div>
        <p className="text-xs text-on-surface-tertiary">
          {isRTL
            ? 'عند التفعيل: المُلخِّص تستخدم Ollama المحلي لمهام الرؤية والكتابة الشخصية والتضمين؛ Claude يظل مسؤول التحليل الأساسي والردود العميقة. أوقف التفعيل للعودة إلى Claude فقط.'
            : 'When on: Al-Mulakhkhis routes vision, personal-writing, and embedding tasks to local Ollama. Claude stays the default for analysis and deep refinements. Turn off to route everything to Claude.'}
        </p>

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <span className="relative inline-block w-10 h-6">
            <input
              type="checkbox"
              checked={state.ollamaEnabled}
              onChange={(e) => setState((s) => ({ ...s, ollamaEnabled: e.target.checked }))}
              className="sr-only peer"
            />
            <span className="absolute inset-0 rounded-full bg-surface-secondary peer-checked:bg-accent transition-colors" />
            <span className="absolute top-0.5 start-0.5 w-5 h-5 rounded-full bg-surface transition-transform peer-checked:translate-x-4 rtl:peer-checked:-translate-x-4 shadow" />
          </span>
          <span className="text-sm text-on-surface">
            {isRTL ? 'تفعيل Ollama المحلي' : 'Enable local Ollama'}
          </span>
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full',
              state.ollamaEnabled ? 'bg-success/15 text-success' : 'bg-surface-secondary text-on-surface-tertiary'
            )}
          >
            {state.ollamaEnabled ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'متوقف' : 'Off')}
          </span>
        </label>

        <div className="space-y-1">
          <label className="text-xs font-medium text-on-surface-secondary">
            {isRTL ? 'عنوان Ollama' : 'Ollama base URL'}
          </label>
          <input
            type="url"
            value={state.ollamaBaseUrl}
            onChange={(e) => setState((s) => ({ ...s, ollamaBaseUrl: e.target.value }))}
            placeholder="http://localhost:11434"
            className="w-full px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm font-mono text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {urlChanged && (
            <p className="text-xs text-warning flex items-center gap-1">
              <AlertCircle size={12} />
              {isRTL ? 'تغيير العنوان يتطلب إعادة تشغيل الخادم.' : 'URL change requires a server restart to take effect.'}
            </p>
          )}
          <p className="text-xs text-on-surface-tertiary">
            {isRTL
              ? 'استخدم عنوان Tailscale عند الوصول عن بعد لجهازك المحلي.'
              : 'Use your Tailscale hostname when connecting remotely to your local box.'}
          </p>
        </div>
      </div>

      <div className="space-y-3 pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          <Plug size={16} className="text-accent" />
          <h3 className="text-sm font-medium text-on-surface">
            {isRTL ? 'التكاملات' : 'Integrations'}
          </h3>
        </div>
        <p className="text-xs text-on-surface-tertiary">
          {isRTL
            ? 'اختبر اتصال Ruhool بـ Zotero و Obsidian قبل أول عملية حفظ.'
            : "Verify Ruhool's connection to Zotero and Obsidian before your first save."}
        </p>

        <div className="rounded-[var(--radius)] border border-border divide-y divide-border overflow-hidden">
          <IntegrationRow
            icon={<Library size={14} className="text-on-surface-secondary" />}
            label="Zotero"
            hintTextRTL="محلي — 23119"
            hintText="Local API — 23119"
            conn={zoteroConn}
            onTest={testZotero}
            isRTL={isRTL}
          />
          <IntegrationRow
            icon={<FileText size={14} className="text-on-surface-secondary" />}
            label="Obsidian"
            hintTextRTL="REST محلي — 27123"
            hintText="Local REST API — 27123"
            conn={obsidianConn}
            onTest={testObsidian}
            isRTL={isRTL}
          />
        </div>

        <p className="text-xs text-on-surface-tertiary">
          {isRTL ? 'تحتاج إلى إعداد؟ راجع ' : 'Need setup? See '}
          <a
            href="/docs/setup/zotero-obsidian.md"
            className="text-accent hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            {isRTL ? 'دليل الإعداد' : 'Setup Guide'}
          </a>
          {isRTL ? ' — 10 دقائق.' : ' — 10 minutes.'}
        </p>
      </div>

      <div style={{ height: saveBarPad }} aria-hidden="true" />
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={handleSave}
        onDiscard={discard}
        successMessage={successMessage}
        errorMessage={errorMessage}
      />
    </div>
  );
}

interface IntegrationRowProps {
  icon: React.ReactNode;
  label: string;
  hintText: string;
  hintTextRTL: string;
  conn: ConnState;
  onTest: () => void;
  isRTL: boolean;
}

function IntegrationRow({ icon, label, hintText, hintTextRTL, conn, onTest, isRTL }: IntegrationRowProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-surface">
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-surface-secondary">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-on-surface">{label}</div>
        <div className="text-[11px] text-on-surface-tertiary truncate">
          {isRTL ? hintTextRTL : hintText}
        </div>
      </div>

      <StatusBadge conn={conn} isRTL={isRTL} />

      <button
        onClick={onTest}
        disabled={conn.status === 'testing'}
        className={cn(
          'text-xs px-3 py-1.5 rounded-[var(--radius)] border transition-colors',
          conn.status === 'testing'
            ? 'border-border text-on-surface-tertiary cursor-wait'
            : 'border-border text-on-surface-secondary hover:bg-surface-secondary'
        )}
      >
        {conn.status === 'testing'
          ? (isRTL ? 'جارٍ الاختبار…' : 'Testing…')
          : (isRTL ? 'اختبار' : 'Test')}
      </button>
    </div>
  );
}

function StatusBadge({ conn, isRTL }: { conn: ConnState; isRTL: boolean }) {
  if (conn.status === 'idle') {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-secondary text-on-surface-tertiary">
        {isRTL ? 'خامل' : 'idle'}
      </span>
    );
  }
  if (conn.status === 'testing') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-surface-secondary text-on-surface-secondary">
        <Loader2 size={10} className="animate-spin" />
        {isRTL ? 'اختبار' : 'testing'}
      </span>
    );
  }
  if (conn.status === 'ok') {
    return (
      <span
        title={conn.detail}
        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-success/15 text-success"
      >
        [OK]
        {conn.detail ? <span className="text-on-surface-tertiary ms-1">{conn.detail}</span> : null}
      </span>
    );
  }
  const tooltip = [conn.error, conn.hint].filter(Boolean).join(' — ');
  return (
    <span
      title={tooltip}
      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-error/15 text-error max-w-[14rem] truncate"
    >
      [FAIL]
      {conn.error ? <span className="text-error/80 ms-1 truncate">{conn.error}</span> : null}
    </span>
  );
}
