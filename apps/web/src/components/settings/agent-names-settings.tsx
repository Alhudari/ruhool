'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { SaveBar, useSaveBarHeight } from '@/components/settings/save-bar';

interface AgentRow {
  id: string;
  name: { en: string; ar: string };
  builtIn?: boolean;
}

interface EditableRow extends AgentRow {
  enInput: string;
  arInput: string;
}

export function AgentNamesSettings() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [rows, setRows] = useState<EditableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<AgentRow[]>('/api/agents')
      .then((agents) => {
        setRows(
          agents.map((a) => ({
            ...a,
            enInput: a.name?.en ?? '',
            arInput: a.name?.ar ?? '',
          }))
        );
      })
      .catch((e) => setErrorMessage(e instanceof Error ? e.message : 'Failed to load agents'))
      .finally(() => setLoading(false));
  }, []);

  const setField = (id: string, key: 'enInput' | 'arInput', value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  };

  const dirtyRows = rows.filter((r) => r.enInput !== r.name.en || r.arInput !== r.name.ar);
  const dirty = dirtyRows.length > 0;
  useUnsavedChanges(dirty);
  const saveBarPad = useSaveBarHeight(dirty || !!successMessage);

  const save = async () => {
    setSaving(true);
    setErrorMessage(null);
    try {
      for (const row of dirtyRows) {
        await apiFetch(`/api/agents/${encodeURIComponent(row.id)}/name`, {
          method: 'PUT',
          body: JSON.stringify({ en: row.enInput, ar: row.arInput }),
        });
      }
      setRows((prev) =>
        prev.map((r) =>
          dirtyRows.some((d) => d.id === r.id)
            ? { ...r, name: { en: r.enInput, ar: r.arInput } }
            : r
        )
      );
      setSuccessMessage(
        isRTL
          ? `حُفظ ${dirtyRows.length} ${dirtyRows.length === 1 ? 'وكيل' : 'وكلاء'}`
          : `Saved ${dirtyRows.length} ${dirtyRows.length === 1 ? 'agent' : 'agents'}`
      );
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : (isRTL ? 'فشل الحفظ' : 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setRows((prev) => prev.map((r) => ({ ...r, enInput: r.name.en, arInput: r.name.ar })));
    setErrorMessage(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-on-surface mb-1">
          {isRTL ? 'أسماء العرض للوكلاء' : 'Agent Display Names'}
        </h2>
        <p className="text-sm text-on-surface-secondary leading-relaxed">
          {isRTL
            ? 'عدّل بحرية. المعرّف الثابت هو ما يستخدمه النظام داخليًا؛ إعادة التسمية هنا تغيّر فقط كيف يظهر الاسم في الواجهة.'
            : 'Edit freely. The stable ID is what the system uses internally; renaming here only changes how the name appears in the UI.'}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 justify-center py-12 text-on-surface-tertiary">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">{isRTL ? 'جاري التحميل...' : 'Loading...'}</span>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const rowDirty = r.enInput !== r.name.en || r.arInput !== r.name.ar;
            return (
              <div
                key={r.id}
                className="rounded-[var(--radius-lg)] border border-border p-4 space-y-3 bg-surface"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <code className="text-[11px] px-2 py-0.5 rounded bg-surface-secondary text-on-surface-tertiary font-mono">
                    {r.id}
                  </code>
                  <div className="flex items-center gap-2">
                    {rowDirty && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning">
                        {isRTL ? 'غير محفوظ' : 'Unsaved'}
                      </span>
                    )}
                    {r.builtIn && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
                        {isRTL ? 'مدمج' : 'Built-in'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-on-surface-secondary mb-1 block">
                      {isRTL ? 'الاسم بالإنجليزية' : 'English name'}
                    </label>
                    <input
                      type="text"
                      value={r.enInput}
                      onChange={(e) => setField(r.id, 'enInput', e.target.value)}
                      dir="ltr"
                      className="w-full px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-on-surface-secondary mb-1 block">
                      {isRTL ? 'الاسم بالعربية' : 'Arabic name'}
                    </label>
                    <input
                      type="text"
                      value={r.arInput}
                      onChange={(e) => setField(r.id, 'arInput', e.target.value)}
                      dir="rtl"
                      className="w-full px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
