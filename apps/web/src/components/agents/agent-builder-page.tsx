'use client';

import { useState } from 'react';
import { useGuardedRouter } from '@/lib/navigation/guarded-router';
import {
  ArrowLeft,
  Bot,
  Compass,
  Search,
  BookOpen,
  PenTool,
  Save,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

const ICONS = [
  { id: 'bot', icon: Bot, label: 'Bot' },
  { id: 'compass', icon: Compass, label: 'Compass' },
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'book-open', icon: BookOpen, label: 'Book' },
  { id: 'pen-tool', icon: PenTool, label: 'Pen' },
];

const COLORS = [
  { id: 'amber', label: 'Amber', class: 'bg-amber-500' },
  { id: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { id: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { id: 'green', label: 'Green', class: 'bg-green-500' },
  { id: 'red', label: 'Red', class: 'bg-red-500' },
  { id: 'pink', label: 'Pink', class: 'bg-pink-500' },
  { id: 'cyan', label: 'Cyan', class: 'bg-cyan-500' },
  { id: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { id: 'gray', label: 'Gray', class: 'bg-gray-500' },
];

const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
];

export function AgentBuilderPage() {
  const { language } = useAppStore();
  const router = useGuardedRouter();
  const isRTL = language === 'ar';

  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('bot');
  const [selectedColor, setSelectedColor] = useState('blue');
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-6');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!nameEn.trim() && !nameAr.trim()) {
      setError(isRTL ? 'أدخل اسم الوكيل' : 'Enter agent name');
      return;
    }
    if (!systemPrompt.trim()) {
      setError(isRTL ? 'أدخل تعليمات النظام' : 'Enter system prompt');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await apiFetch('/api/custom-agents', {
        method: 'POST',
        body: JSON.stringify({
          name: { en: nameEn || nameAr, ar: nameAr || nameEn },
          systemPrompt,
          icon: selectedIcon,
          color: selectedColor,
          model: selectedModel,
        }),
      });
      router.push('/agents');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.push('/agents')}
          className="p-2 rounded-[var(--radius)] hover:bg-surface-secondary transition-colors text-on-surface-secondary"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-semibold text-on-surface">
          {isRTL ? 'وكيل جديد' : 'New Agent'}
        </h1>
      </div>

      <div className="space-y-6">
        {/* Name */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-on-surface">
            {isRTL ? 'الاسم' : 'Name'}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-on-surface-tertiary mb-1 block">English</label>
              <input
                type="text"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. My Research Agent"
                className="w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-input text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs text-on-surface-tertiary mb-1 block" dir="rtl">العربي</label>
              <input
                type="text"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder="مثلا: وكيل البحث"
                dir="rtl"
                className="w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-input text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        {/* System Prompt */}
        <div>
          <label className="text-sm font-medium text-on-surface mb-2 block">
            {isRTL ? 'تعليمات النظام' : 'System Prompt'}
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder={isRTL ? 'اكتب تعليمات الوكيل هنا...' : 'Write the agent instructions here...'}
            rows={10}
            className="w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-input text-on-surface text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          />
          <p className="text-xs text-on-surface-tertiary mt-1">
            {isRTL
              ? `${systemPrompt.length} حرف`
              : `${systemPrompt.length} characters`}
          </p>
        </div>

        {/* Icon Selector */}
        <div>
          <label className="text-sm font-medium text-on-surface mb-2 block">
            {isRTL ? 'الأيقونة' : 'Icon'}
          </label>
          <div className="flex gap-2">
            {ICONS.map((ic) => (
              <button
                key={ic.id}
                onClick={() => setSelectedIcon(ic.id)}
                className={cn(
                  'p-3 rounded-[var(--radius)] border transition-colors',
                  selectedIcon === ic.id
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-on-surface-secondary hover:border-border-hover'
                )}
              >
                <ic.icon size={20} />
              </button>
            ))}
          </div>
        </div>

        {/* Color Selector */}
        <div>
          <label className="text-sm font-medium text-on-surface mb-2 block">
            {isRTL ? 'اللون' : 'Color'}
          </label>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedColor(c.id)}
                className={cn(
                  'w-8 h-8 rounded-full transition-all',
                  c.class,
                  selectedColor === c.id
                    ? 'ring-2 ring-offset-2 ring-accent ring-offset-surface'
                    : 'opacity-60 hover:opacity-100'
                )}
                title={c.label}
              />
            ))}
          </div>
        </div>

        {/* Model Selector */}
        <div>
          <label className="text-sm font-medium text-on-surface mb-2 block">
            {isRTL ? 'النموذج' : 'Model'}
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-input text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        {/* Save */}
        <div className="flex justify-end pt-4 border-t border-border">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 rounded-[var(--radius)] bg-accent text-on-accent hover:bg-accent-hover transition-colors text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {isRTL ? 'حفظ الوكيل' : 'Save Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}
