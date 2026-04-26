'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Link2, RefreshCw, CheckCircle2, AlertTriangle, Unlink, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface Config {
  hasClientId: boolean;
  hasClientSecret: boolean;
  clientIdMasked: string;
  redirectUri: string;
  connected: boolean;
  accountEmail: string | null;
  listId: string | null;
  listTitle: string | null;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

interface TaskList { id: string; title: string }

export function GoogleTasksSettings() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [cfg, setCfg] = useState<Config | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [lists, setLists] = useState<TaskList[]>([]);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<'push' | 'pull' | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    apiFetch<Config>('/api/google-tasks/config')
      .then((r) => {
        setCfg(r);
        if (!redirectUri) setRedirectUri(r.redirectUri || `${location.origin.replace(':3000', ':3001')}/api/google-tasks/oauth/callback`);
      })
      .catch(() => setCfg(null));
  }, [redirectUri]);

  useEffect(() => {
    load();
    const params = new URLSearchParams(location.search);
    if (params.get('gt') === 'connected') {
      setMessage({ ok: true, text: isRTL ? 'تم الربط بنجاح' : 'Connected successfully' });
    }
  }, [load, isRTL]);

  useEffect(() => {
    if (!cfg?.connected) return;
    apiFetch<{ lists: TaskList[] }>('/api/google-tasks/lists')
      .then((r) => setLists(r.lists))
      .catch(() => setLists([]));
  }, [cfg?.connected]);

  const saveConfig = async (patch: Partial<Config & { clientId: string; clientSecret: string }>) => {
    setSaving(true);
    try {
      await apiFetch('/api/google-tasks/config', { method: 'PUT', body: JSON.stringify(patch) });
      load();
    } finally {
      setSaving(false);
    }
  };

  const connect = async () => {
    if (!clientId.trim() && !cfg?.hasClientId) {
      setMessage({ ok: false, text: isRTL ? 'أدخل Client ID + Secret أولاً' : 'Enter Client ID + Secret first' });
      return;
    }
    await saveConfig({
      clientId: clientId.trim() || undefined,
      clientSecret: clientSecret.trim() || undefined,
      redirectUri: redirectUri.trim() || undefined,
    } as Partial<Config & { clientId: string; clientSecret: string }>);
    setClientId('');
    setClientSecret('');
    try {
      const r = await apiFetch<{ url: string }>('/api/google-tasks/oauth/start', { method: 'POST' });
      window.location.href = r.url;
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'failed' });
    }
  };

  const disconnect = async () => {
    if (!confirm(isRTL ? 'فك الربط مع Google Tasks؟' : 'Disconnect Google Tasks?')) return;
    await apiFetch('/api/google-tasks/disconnect', { method: 'POST' });
    load();
  };

  const sync = async (dir: 'push' | 'pull') => {
    setSyncing(dir);
    setMessage(null);
    try {
      const r = await apiFetch<{ created?: number; updated?: number; pulled?: number; conflicts?: number }>(
        `/api/google-tasks/sync/${dir}`,
        { method: 'POST' },
      );
      const parts: string[] = [];
      if (r.created !== undefined) parts.push(`+${r.created} created`);
      if (r.updated !== undefined) parts.push(`${r.updated} updated`);
      if (r.pulled !== undefined) parts.push(`${r.pulled} pulled`);
      if (r.conflicts) parts.push(`${r.conflicts} conflicts`);
      setMessage({ ok: true, text: parts.join(' · ') || (isRTL ? 'اكتمل' : 'Done') });
      load();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'failed' });
    }
    setSyncing(null);
  };

  if (!cfg) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-on-surface-tertiary" />
      </div>
    );
  }

  return (
    <div className="space-y-5" dir={isRTL ? 'rtl' : 'ltr'}>
      <div>
        <h2 className="text-lg font-medium text-on-surface mb-1">
          {isRTL ? 'مزامنة Google Tasks' : 'Google Tasks sync'}
        </h2>
        <p className="text-sm text-on-surface-secondary">
          {isRTL
            ? 'مزامنة مهامك مع Google Tasks حتى تظهر على هاتفك في تطبيق Google Tasks أو Google Calendar.'
            : "Sync your tasks to Google Tasks so they appear on your phone in Google Tasks or Google Calendar."}
        </p>
      </div>

      {message && (
        <div className={cn(
          'rounded-[var(--radius)] px-3 py-2 text-xs flex items-start gap-2',
          message.ok ? 'bg-success/10 text-success' : 'bg-error/10 text-error',
        )}>
          {message.ok ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="shrink-0 mt-0.5" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Setup: OAuth credentials */}
      {!cfg.connected && (
        <div className="rounded-[var(--radius-lg)] border border-border p-4 space-y-3 bg-surface">
          <h3 className="text-sm font-semibold text-on-surface">
            {isRTL ? '1. أنشئ عميل OAuth في Google Cloud' : '1. Create OAuth client in Google Cloud'}
          </h3>
          <ol className="text-xs text-on-surface-secondary space-y-1 ps-5 list-decimal">
            <li>
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                {isRTL ? 'افتح Cloud Console → Credentials' : 'Open Cloud Console → Credentials'}
                <ExternalLink size={10} />
              </a>
            </li>
            <li>{isRTL ? 'فعّل Tasks API من Library' : 'Enable the Tasks API from the Library'}</li>
            <li>{isRTL ? 'أنشئ OAuth 2.0 Client ID (Web application)' : 'Create an OAuth 2.0 Client ID (Web application)'}</li>
            <li>
              {isRTL ? 'أضف في Authorized redirect URIs:' : 'Add this redirect URI:'}
              <code className="block mt-1 px-2 py-1 bg-surface-secondary rounded text-[10px] font-mono break-all">
                {redirectUri}
              </code>
            </li>
          </ol>

          <h3 className="text-sm font-semibold text-on-surface pt-3">
            {isRTL ? '2. الصق القيم' : '2. Paste the values'}
          </h3>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-on-surface-tertiary mb-1">Client ID</label>
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder={cfg.hasClientId ? (cfg.clientIdMasked || '••••••••') : '123456-abc.apps.googleusercontent.com'}
              className="w-full h-9 bg-surface-secondary border border-border rounded px-3 text-xs text-on-surface font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-on-surface-tertiary mb-1">Client Secret</label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={cfg.hasClientSecret ? '••••••••' : 'GOCSPX-...'}
              className="w-full h-9 bg-surface-secondary border border-border rounded px-3 text-xs text-on-surface font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-on-surface-tertiary mb-1">Redirect URI</label>
            <input
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              className="w-full h-9 bg-surface-secondary border border-border rounded px-3 text-xs text-on-surface font-mono"
            />
          </div>

          <button
            onClick={connect}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] bg-accent text-on-accent text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            {isRTL ? 'اربط مع Google' : 'Connect to Google'}
          </button>
        </div>
      )}

      {cfg.connected && (
        <div className="rounded-[var(--radius-lg)] border border-success/30 bg-success/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-success" />
            <div className="flex-1">
              <p className="text-sm font-medium text-on-surface">
                {isRTL ? 'مربوط' : 'Connected'}
              </p>
              <p className="text-[11px] text-on-surface-tertiary">
                <bdi>{cfg.accountEmail ?? '—'}</bdi>
              </p>
            </div>
            <button
              onClick={disconnect}
              className="inline-flex items-center gap-1 text-xs text-error hover:bg-error/10 px-2 py-1 rounded"
            >
              <Unlink size={12} />
              {isRTL ? 'فك الربط' : 'Disconnect'}
            </button>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-on-surface-tertiary mb-1">
              {isRTL ? 'القائمة المستهدفة' : 'Target list'}
            </label>
            <select
              value={cfg.listId ?? ''}
              onChange={(e) => saveConfig({ listId: e.target.value || undefined })}
              className="w-full h-9 bg-surface border border-border rounded px-3 text-xs text-on-surface"
            >
              <option value="">{isRTL ? '— اختر قائمة —' : '— choose list —'}</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>{l.title}</option>
              ))}
            </select>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-on-surface cursor-pointer">
            <input
              type="checkbox"
              role="switch"
              aria-checked={cfg.syncEnabled}
              checked={cfg.syncEnabled}
              onChange={(e) => saveConfig({ syncEnabled: e.target.checked })}
              className="accent-accent h-4 w-4"
            />
            <span>{isRTL ? 'تفعيل المزامنة' : 'Enable sync'}</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={() => sync('push')}
              disabled={syncing !== null || !cfg.listId || !cfg.syncEnabled}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-50"
            >
              {syncing === 'push' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {isRTL ? 'ادفع الآن' : 'Push now'}
            </button>
            <button
              onClick={() => sync('pull')}
              disabled={syncing !== null || !cfg.listId}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-info/15 text-info hover:bg-info/25 disabled:opacity-50"
            >
              {syncing === 'pull' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {isRTL ? 'اسحب الآن' : 'Pull now'}
            </button>
          </div>

          {cfg.lastSyncAt && (
            <p className="text-[11px] text-on-surface-tertiary">
              {isRTL ? 'آخر مزامنة:' : 'Last sync:'}{' '}
              <bdi className="font-mono">{new Date(cfg.lastSyncAt).toLocaleString(isRTL ? 'ar' : 'en')}</bdi>
            </p>
          )}
          {cfg.lastError && (
            <p className="text-[11px] text-error">
              <bdi>{cfg.lastError}</bdi>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
