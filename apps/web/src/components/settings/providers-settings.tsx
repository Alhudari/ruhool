'use client';

import { useState, useEffect } from 'react';
import {
  Check,
  X,
  Loader2,
  Eye,
  EyeOff,
  TestTube2,
  Sparkles,
  Zap,
  Cloud,
  Server,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';

interface Provider {
  id: string;
  type: string;
  displayName: string;
  baseUrl: string | null;
  defaultModel: string | null;
  enabled: boolean;
  status: string;
  lastTestAt: string | null;
}

const PROVIDER_TYPES = [
  {
    type: 'anthropic',
    name: 'Anthropic Claude',
    icon: Sparkles,
    color: 'text-purple-500',
    models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    defaultModel: 'claude-sonnet-4-6',
  },
  {
    type: 'openai',
    name: 'OpenAI',
    icon: Zap,
    color: 'text-green-500',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    defaultModel: 'gpt-4o',
  },
  {
    type: 'google-gemini',
    name: 'Google Gemini',
    icon: Cloud,
    color: 'text-blue-500',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    defaultModel: 'gemini-2.5-pro',
  },
  {
    type: 'ollama',
    name: 'Ollama (Local)',
    icon: Server,
    color: 'text-orange-500',
    models: [],
    defaultModel: '',
  },
];

export function ProvidersSettings() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProviders = async () => {
    try {
      const rows = await apiFetch<Provider[]>('/api/providers');
      setProviders(rows);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-on-surface mb-1">
          {isRTL ? 'مزودي API' : 'API Providers'}
        </h2>
        <p className="text-sm text-on-surface-secondary">
          {isRTL
            ? 'أضف مفاتيح API الخاصة بك للتواصل مع نماذج الذكاء الاصطناعي'
            : 'Add your API keys to connect with AI models'}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-on-surface-tertiary py-8 justify-center">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">{isRTL ? 'جاري التحميل...' : 'Loading...'}</span>
        </div>
      ) : (
        <div className="space-y-4">
          {PROVIDER_TYPES.map((pt) => {
            const existing = providers.find((p) => p.type === pt.type);
            return (
              <ProviderCard
                key={pt.type}
                providerType={pt}
                existing={existing}
                onSaved={loadProviders}
                language={language}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProviderCard({
  providerType,
  existing,
  onSaved,
  language,
}: {
  providerType: (typeof PROVIDER_TYPES)[number];
  existing?: Provider;
  onSaved: () => void;
  language: 'en' | 'ar';
}) {
  const isRTL = language === 'ar';
  const [isEditing, setIsEditing] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl || '');
  const [model, setModel] = useState(
    existing?.defaultModel || providerType.defaultModel
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const editDirty = isEditing && (
    apiKey.length > 0 ||
    baseUrl !== (existing?.baseUrl || '') ||
    model !== (existing?.defaultModel || providerType.defaultModel)
  );
  useUnsavedChanges(editDirty);

  const Icon = providerType.icon;

  const handleSave = async () => {
    setSaving(true);
    try {
      if (existing) {
        await apiFetch(`/api/providers/${existing.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            apiKey: apiKey || undefined,
            baseUrl: baseUrl || undefined,
            defaultModel: model || undefined,
          }),
        });
      } else {
        await apiFetch('/api/providers', {
          method: 'POST',
          body: JSON.stringify({
            type: providerType.type,
            displayName: providerType.name,
            apiKey,
            baseUrl: baseUrl || undefined,
            defaultModel: model,
          }),
        });
      }
      setIsEditing(false);
      setApiKey('');
      onSaved();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!existing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiFetch<{ ok: boolean; error?: string }>(
        `/api/providers/${existing.id}/test`,
        { method: 'POST' }
      );
      setTestResult(result);
      onSaved();
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const statusColor =
    existing?.status === 'ok'
      ? 'text-success'
      : existing?.status === 'failing'
        ? 'text-error'
        : 'text-on-surface-tertiary';

  return (
    <div className="border border-border rounded-[var(--radius-lg)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Icon size={20} className={providerType.color} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-on-surface">{providerType.name}</p>
          {existing && (
            <p className={cn('text-xs mt-0.5', statusColor)}>
              {existing.status === 'ok'
                ? isRTL ? '✓ متصل' : '✓ Connected'
                : existing.status === 'failing'
                  ? isRTL ? '✗ فشل الاتصال' : '✗ Connection failed'
                  : isRTL ? '○ لم يختبر' : '○ Not tested'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {existing && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius)] text-xs bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary transition-colors disabled:opacity-50"
            >
              {testing ? <Loader2 size={12} className="animate-spin" /> : <TestTube2 size={12} />}
              {isRTL ? 'اختبار' : 'Test'}
            </button>
          )}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="px-3 py-1.5 rounded-[var(--radius)] text-xs bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
          >
            {existing ? (isRTL ? 'تعديل' : 'Edit') : (isRTL ? 'إضافة' : 'Add')}
          </button>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={cn(
            'px-4 py-2 text-xs flex items-center gap-2',
            testResult.ok ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
          )}
        >
          {testResult.ok ? <Check size={12} /> : <X size={12} />}
          {testResult.ok
            ? isRTL ? 'الاتصال ناجح!' : 'Connection successful!'
            : testResult.error}
        </div>
      )}

      {/* Edit form */}
      {isEditing && (
        <div className="border-t border-border px-4 py-4 space-y-3 bg-surface-secondary/50">
          {/* API Key */}
          <div>
            <label className="text-xs text-on-surface-secondary mb-1 block">
              {isRTL ? 'مفتاح API' : 'API Key'}
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={existing ? (isRTL ? 'اترك فارغاً للإبقاء' : 'Leave blank to keep current') : 'sk-...'}
                className="w-full px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className={cn(
                  'absolute top-1/2 -translate-y-1/2 p-1 text-on-surface-tertiary hover:text-on-surface-secondary',
                  isRTL ? 'left-2' : 'right-2'
                )}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Base URL */}
          {providerType.type === 'ollama' && (
            <div>
              <label className="text-xs text-on-surface-secondary mb-1 block">
                {isRTL ? 'عنوان URL' : 'Base URL'}
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {/* Default Model */}
          {providerType.models.length > 0 && (
            <div>
              <label className="text-xs text-on-surface-secondary mb-1 block">
                {isRTL ? 'النموذج الافتراضي' : 'Default Model'}
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {providerType.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Save */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setIsEditing(false);
                setApiKey('');
              }}
              className="px-4 py-2 rounded-[var(--radius)] text-sm text-on-surface-secondary hover:bg-surface-tertiary transition-colors"
            >
              {isRTL ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || (!apiKey && !existing)}
              className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isRTL ? 'حفظ' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
