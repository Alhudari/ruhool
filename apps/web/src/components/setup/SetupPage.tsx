'use client';

import { useEffect, useState } from 'react';
import { Loader2, Check, AlertTriangle, Sparkles, RotateCcw, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface VaultActiveResponse {
  currentRoot: string;
  newProposedRoot: string;
  vaultName: string;
}
interface InitPreviewResponse {
  root: string;
  folders: Array<{ folder: string; status: string }>;
  files: Array<{ file: string; status: string }>;
}
interface InitResultResponse {
  root: string;
  created: string[];
  skipped: string[];
  hint: string;
}

export function SetupPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [active, setActive] = useState<VaultActiveResponse | null>(null);
  const [preview, setPreview] = useState<InitPreviewResponse | null>(null);
  const [result, setResult] = useState<InitResultResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const [a, p] = await Promise.all([
        apiFetch<VaultActiveResponse>('/api/vault/active'),
        apiFetch<InitPreviewResponse>('/api/vault/init/preview'),
      ]);
      setActive(a); setPreview(p);
    } catch { /* ignore */ }
  };
  useEffect(() => { refresh(); }, []);

  const runInit = async () => {
    setRunning(true);
    try {
      const r = await apiFetch<InitResultResponse>('/api/vault/init', { method: 'POST', body: '{}' });
      setResult(r);
      refresh();
    } catch { /* ignore */ }
    setRunning(false);
  };

  const runReset = async () => {
    if (!confirm(isRTL ? 'هل أنت متأكد من تصفير ذاكرة كل العملاء والمهام؟' : 'Reset all agent memory and tasks — sure?')) return;
    setResetting(true);
    try {
      const r = await apiFetch<{ cleared: Record<string, number> }>('/api/system/reset', { method: 'POST', body: '{}' });
      setResetResult(JSON.stringify(r.cleared, null, 2));
    } catch (e) { setResetResult(`Error: ${e}`); }
    setResetting(false);
  };

  // R16 — fresh-start: wipe all user content AND seed the welcome
  // inbox message from الراعي. Preserves provider keys + oauth + prefs.
  const runFreshStart = async () => {
    if (!confirm(isRTL
      ? 'سيُمسح كل المحتوى (محادثات/مهام/ملاحظات/تقارير) وتعود المنصة كأنها جديدة تماماً مع رسالة ترحيب من الراعي. المفاتيح والإعدادات التقنية تبقى. متأكد؟'
      : 'This wipes all user content (conversations/tasks/notes/reports) and resets the platform to a fresh state with a welcome from Al-Ra\'i. Technical config (keys, OAuth, prefs) is preserved. Continue?')) return;
    setResetting(true);
    try {
      const r = await apiFetch<{ cleared: number; welcomeId: string }>('/api/platform/reset-to-fresh', { method: 'POST', body: '{}' });
      setResetResult((isRTL ? 'تمّت الإعادة! مسح ' : 'Fresh start done. Cleared ') + r.cleared + (isRTL ? ' عنصر. افتح صندوق التقارير لقراءة رسالة الترحيب.' : ' items. Open the Reports Inbox to read the welcome.'));
    } catch (e) { setResetResult(`Error: ${e}`); }
    setResetting(false);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-surface" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-3xl mx-auto px-6 md:px-10 py-10 space-y-8">
        <header>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-accent" />
            <h1 className="text-2xl font-bold text-on-surface">
              {isRTL ? 'إعداد المنصة' : 'Platform Setup'}
            </h1>
          </div>
          <p className="text-sm text-on-surface-tertiary">
            {isRTL
              ? 'تهيئة Vault جديد وتصفير شامل للنظام عند البداية من الصفر'
              : 'Initialize a new vault and full reset when starting fresh'}
          </p>
        </header>

        {/* Active vault */}
        <section className="rounded-xl border border-border bg-surface-secondary p-5">
          <h2 className="text-sm font-semibold text-on-surface mb-3 flex items-center gap-2">
            <Check className="h-4 w-4 text-success" />
            {isRTL ? 'Vault النشط' : 'Active Vault'}
          </h2>
          {!active ? (
            <Loader2 className="h-4 w-4 animate-spin text-on-surface-tertiary" />
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-on-surface-tertiary">{isRTL ? 'الحالي:' : 'Current:'}</span>
                <code className="text-xs bg-surface px-2 py-1 rounded border border-border break-all">{active.currentRoot}</code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-on-surface-tertiary">{isRTL ? 'المقترح الجديد:' : 'New proposed:'}</span>
                <code className="text-xs bg-surface px-2 py-1 rounded border border-border break-all">{active.newProposedRoot}</code>
              </div>
              {active.currentRoot !== active.newProposedRoot && (
                <div className="mt-3 rounded-lg border border-info bg-info/10 px-3 py-2 text-xs text-info flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    {isRTL
                      ? 'لتفعيل Vault الجديد بنقرة (يُحفظ تلقائياً، لا يحتاج تعديل .env):'
                      : 'Activate the new vault with one click (auto-saved, no .env edit needed):'}
                    <button
                      onClick={async () => {
                        try {
                          const r = await apiFetch<{ ok: boolean; activePath: string }>('/api/vault/active', {
                            method: 'POST',
                            body: JSON.stringify({ path: active.newProposedRoot }),
                          });
                          alert(isRTL ? `✓ تم التبديل إلى:\n${r.activePath}` : `✓ Switched to:\n${r.activePath}`);
                          // Reload to refresh
                          window.location.reload();
                        } catch (e) {
                          alert(e instanceof Error ? e.message : 'failed');
                        }
                      }}
                      className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded bg-info text-white text-xs hover:opacity-90"
                    >
                      <Check className="h-3 w-3" />
                      {isRTL ? 'استخدم هذا المسار الآن' : 'Use this path now'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Initialize new vault structure */}
        <section className="rounded-xl border border-border bg-surface-secondary p-5">
          <h2 className="text-sm font-semibold text-on-surface mb-3">
            {isRTL ? 'إنشاء بنية Vault الجديدة' : 'Create new vault structure'}
          </h2>
          <p className="text-xs text-on-surface-tertiary mb-4">
            {isRTL
              ? 'سيُنشأ Vault مُهيكل بطريقة مُحسَّنة للمنصة. لن يلمس Vault القديم.'
              : 'Creates a platform-optimized vault structure. Old vault is untouched.'}
          </p>
          {preview && (
            <div className="grid grid-cols-2 gap-2 mb-4 max-h-64 overflow-y-auto">
              {preview.folders.map((f) => (
                <div key={f.folder} className={cn(
                  'text-[11px] px-2 py-1 rounded border flex items-center gap-1.5',
                  f.status === 'exists' ? 'border-success/30 bg-success/5 text-success' : 'border-border bg-surface text-on-surface-secondary'
                )}>
                  {f.status === 'exists' ? <Check className="h-3 w-3" /> : <span className="text-warning">+</span>}
                  <span className="truncate">{f.folder}</span>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={runInit}
            disabled={running}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-50"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {isRTL ? 'إنشاء البنية' : 'Initialize structure'}
          </button>
          {result && (
            <div className="mt-4 rounded-lg border border-success/30 bg-success/10 p-3 text-xs">
              <p className="text-success font-semibold mb-1">
                ✓ {isRTL ? `أُنشئ ${result.created.length} عنصر، تخطي ${result.skipped.length}` : `Created ${result.created.length}, skipped ${result.skipped.length}`}
              </p>
              <p className="text-on-surface-tertiary">{result.hint}</p>
            </div>
          )}
        </section>

        {/* Reset */}
        <section className="rounded-xl border border-error/30 bg-error/5 p-5">
          <h2 className="text-sm font-semibold text-error mb-3 flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            {isRTL ? 'تصفير شامل (خطر)' : 'Full Reset (danger)'}
          </h2>
          <p className="text-xs text-on-surface-tertiary mb-4">
            {isRTL
              ? 'يحذف ذاكرة الخوي، كل المحادثات، المهام، وصندوق الالتقاط. لا يلمس Obsidian. غير قابل للاسترجاع.'
              : "Wipes Al-Khuwy's memory, all conversations, tasks, and inbox. Doesn't touch Obsidian. Irreversible."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={runReset}
              disabled={resetting}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-error text-white hover:opacity-90 disabled:opacity-50"
            >
              {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              {isRTL ? 'صفّر النظام الآن' : 'Reset system now'}
            </button>
            <button
              onClick={runFreshStart}
              disabled={resetting}
              title={isRTL ? 'ابدأ كأن المنصة جديدة — مع رسالة ترحيب من الراعي' : 'Start fresh with a welcome message from Al-Ra\'i'}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-accent text-on-accent hover:opacity-90 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isRTL ? 'ابدأ من جديد مع ترحيب' : 'Fresh start with welcome'}
            </button>
          </div>
          {resetResult && (
            <pre className="mt-3 p-2 bg-surface rounded text-xs text-on-surface-secondary font-mono overflow-x-auto whitespace-pre-wrap">{resetResult}</pre>
          )}
        </section>
      </div>
    </div>
  );
}
