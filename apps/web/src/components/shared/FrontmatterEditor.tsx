'use client';

import { useState } from 'react';
import { Plus, X, Check, Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

type FmValue = string | number | boolean | null | string[];

interface FrontmatterEditorProps {
  /** Vault path of the note whose frontmatter we're editing */
  vaultPath: string;
  /** Current frontmatter (key → value) */
  initial: Record<string, unknown>;
  /** API endpoint to PATCH the new frontmatter to. Receives `{ meta: {...} }` body. */
  patchUrl: string;
  /** Optional: callback after save */
  onSaved?: (newFm: Record<string, unknown>) => void;
}

function detectKind(v: unknown): 'string' | 'number' | 'boolean' | 'array' | 'null' {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  return 'string';
}

export function FrontmatterEditor({ vaultPath: _vaultPath, initial, patchUrl, onSaved }: FrontmatterEditorProps) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [fm, setFm] = useState<Record<string, FmValue>>(() => {
    const out: Record<string, FmValue> = {};
    for (const [k, v] of Object.entries(initial)) {
      out[k] = v as FmValue;
    }
    return out;
  });
  const [newKey, setNewKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateValue = (key: string, value: FmValue) => {
    setFm((prev) => ({ ...prev, [key]: value }));
  };

  const removeKey = (key: string) => {
    setFm((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const addKey = () => {
    const k = newKey.trim();
    if (!k) return;
    if (k in fm) { setError(`Key "${k}" already exists`); return; }
    setFm((prev) => ({ ...prev, [k]: '' }));
    setNewKey('');
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(patchUrl, { method: 'PATCH', body: JSON.stringify({ meta: fm }) });
      setSavedAt(new Date().toISOString());
      onSaved?.(fm);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    }
    setSaving(false);
  };

  return (
    <div className="rounded-xl border border-border bg-surface-secondary p-4 space-y-3" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-on-surface">
          {isRTL ? 'بيانات الملف (Frontmatter)' : 'Frontmatter'}
        </h3>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-accent text-on-accent disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          {isRTL ? 'احفظ' : 'Save'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-error bg-error/10 border border-error/30 rounded px-2 py-1">{error}</div>
      )}
      {savedAt && !error && (
        <div className="text-xs text-success flex items-center gap-1">
          <Check className="h-3 w-3" />
          {isRTL ? 'محفوظ' : 'Saved'} {new Date(savedAt).toLocaleTimeString()}
        </div>
      )}

      <div className="space-y-1.5">
        {Object.entries(fm).map(([key, value]) => {
          const kind = detectKind(value);
          return (
            <div key={key} className="flex items-start gap-2 group">
              <span className="text-[11px] font-mono text-accent w-32 shrink-0 truncate pt-1.5">{key}:</span>
              <div className="flex-1 min-w-0">
                {kind === 'boolean' ? (
                  <button
                    onClick={() => updateValue(key, !value)}
                    className={cn(
                      'text-xs px-2 py-1 rounded border',
                      value ? 'bg-success/15 text-success border-success/30' : 'bg-surface text-on-surface-tertiary border-border'
                    )}
                  >
                    {String(value)}
                  </button>
                ) : kind === 'array' ? (
                  <input
                    value={(value as string[]).join(', ')}
                    onChange={(e) => updateValue(key, e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                    placeholder="comma, separated, values"
                    className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-accent"
                  />
                ) : kind === 'null' ? (
                  <input
                    value=""
                    onChange={(e) => updateValue(key, e.target.value)}
                    placeholder="(null — type to set)"
                    className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-on-surface-tertiary focus:outline-none focus:border-accent"
                  />
                ) : (
                  <input
                    type={kind === 'number' ? 'number' : 'text'}
                    value={String(value ?? '')}
                    onChange={(e) => {
                      const v = kind === 'number' ? (e.target.value ? Number(e.target.value) : null) : e.target.value;
                      updateValue(key, v as FmValue);
                    }}
                    className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-accent"
                  />
                )}
              </div>
              <button
                onClick={() => removeKey(key)}
                className="opacity-0 group-hover:opacity-100 text-on-surface-tertiary hover:text-error mt-1.5"
                title={isRTL ? 'حذف' : 'Remove'}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add new key */}
      <div className="flex items-center gap-2 pt-3 border-t border-border">
        <input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addKey(); }}
          placeholder={isRTL ? 'مفتاح جديد' : 'new key'}
          className="flex-1 bg-surface border border-border rounded px-2 py-1 text-xs font-mono text-on-surface focus:outline-none focus:border-accent"
        />
        <button onClick={addKey} disabled={!newKey.trim()} className="px-2 py-1 rounded bg-accent text-on-accent disabled:opacity-40">
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
