'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, Mail, MessageSquare, Save, Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';

interface NotificationData {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  slackWebhookUrl: string;
  desktopEnabled: boolean;
  hasSmtpPass: boolean;
}

export function NotificationSettings() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [desktopEnabled, setDesktopEnabled] = useState(true);
  const [hasSmtpPass, setHasSmtpPass] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testResult, setTestResult] = useState<{ type: string; ok: boolean; msg: string } | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<NotificationData>('/api/settings/notifications');
      setSmtpHost(data.smtpHost);
      setSmtpPort(data.smtpPort);
      setSmtpUser(data.smtpUser);
      setSmtpFrom(data.smtpFrom);
      setSlackWebhookUrl(data.slackWebhookUrl);
      setDesktopEnabled(data.desktopEnabled);
      setHasSmtpPass(data.hasSmtpPass);
    } catch {
      // defaults
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/settings/notifications', {
        method: 'PUT',
        body: JSON.stringify({
          smtpHost,
          smtpPort,
          smtpUser,
          smtpPass: smtpPass || undefined,
          smtpFrom,
          slackWebhookUrl,
          desktopEnabled,
        }),
      });
      setSaved(true);
      setHasSmtpPass(hasSmtpPass || !!smtpPass);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silently fail
    }
    setSaving(false);
  };

  const handleTest = async (type: 'desktop' | 'email' | 'slack') => {
    setTestResult(null);
    try {
      if (type === 'desktop') {
        if ('Notification' in window) {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            new Notification('Ruhool', { body: isRTL ? 'اختبار الإشعارات' : 'Test notification' });
            setTestResult({ type, ok: true, msg: isRTL ? 'تم الإرسال' : 'Sent' });
          } else {
            setTestResult({ type, ok: false, msg: isRTL ? 'الإذن مرفوض' : 'Permission denied' });
          }
        }
        return;
      }
      await apiFetch('/api/notify', {
        method: 'POST',
        body: JSON.stringify({
          type,
          title: 'Ruhool Test',
          message: isRTL ? 'هذا اختبار من منصة رحول' : 'This is a test notification from Ruhool',
        }),
      });
      setTestResult({ type, ok: true, msg: isRTL ? 'تم الإرسال' : 'Sent successfully' });
    } catch (err) {
      setTestResult({ type, ok: false, msg: err instanceof Error ? err.message : 'Failed' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-on-surface-tertiary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-on-surface mb-1">
          {isRTL ? 'الإشعارات' : 'Notifications'}
        </h2>
        <p className="text-sm text-on-surface-secondary">
          {isRTL
            ? 'إعداد طريقة استقبال التنبيهات والإشعارات'
            : 'Configure how you receive alerts and notifications'}
        </p>
      </div>

      {/* Desktop Notifications */}
      <div className="border border-border rounded-[var(--radius-lg)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-on-surface-secondary" />
            <span className="text-sm font-medium text-on-surface">
              {isRTL ? 'إشعارات سطح المكتب' : 'Desktop Notifications'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDesktopEnabled(!desktopEnabled)}
              className={cn(
                'relative w-10 h-5 rounded-full transition-colors',
                desktopEnabled ? 'bg-accent' : 'bg-surface-tertiary'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  desktopEnabled ? 'translate-x-5' : 'translate-x-0.5'
                )}
              />
            </button>
            <button
              onClick={() => handleTest('desktop')}
              className="text-xs px-2 py-1 rounded bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary transition-colors"
            >
              <Send size={12} className="inline mr-1" />
              {isRTL ? 'اختبار' : 'Test'}
            </button>
          </div>
        </div>
        <p className="text-xs text-on-surface-tertiary">
          {isRTL ? 'عرض إشعارات المتصفح للأحداث المهمة' : 'Show browser notifications for important events'}
        </p>
        {testResult?.type === 'desktop' && (
          <p className={cn('text-xs', testResult.ok ? 'text-green-400' : 'text-red-400')}>{testResult.msg}</p>
        )}
      </div>

      {/* Email SMTP */}
      <div className="border border-border rounded-[var(--radius-lg)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail size={16} className="text-on-surface-secondary" />
            <span className="text-sm font-medium text-on-surface">
              {isRTL ? 'البريد الإلكتروني (SMTP)' : 'Email (SMTP)'}
            </span>
          </div>
          <button
            onClick={() => handleTest('email')}
            className="text-xs px-2 py-1 rounded bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary transition-colors"
          >
            <Send size={12} className="inline mr-1" />
            {isRTL ? 'إرسال تجريبي' : 'Send Test'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-on-surface-tertiary mb-1">
              {isRTL ? 'خادم SMTP' : 'SMTP Host'}
            </label>
            <input
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="smtp.gmail.com"
              className="w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-surface text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-on-surface-tertiary mb-1">
              {isRTL ? 'المنفذ' : 'Port'}
            </label>
            <input
              type="number"
              value={smtpPort}
              onChange={(e) => setSmtpPort(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-surface text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-on-surface-tertiary mb-1">
              {isRTL ? 'اسم المستخدم' : 'Username'}
            </label>
            <input
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              className="w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-surface text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-on-surface-tertiary mb-1">
              {isRTL ? 'كلمة المرور' : 'Password'}
            </label>
            <input
              type="password"
              value={smtpPass}
              onChange={(e) => setSmtpPass(e.target.value)}
              placeholder={hasSmtpPass ? '********' : ''}
              className="w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-surface text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-on-surface-tertiary mb-1">
              {isRTL ? 'عنوان المرسل' : 'From Address'}
            </label>
            <input
              value={smtpFrom}
              onChange={(e) => setSmtpFrom(e.target.value)}
              placeholder="noreply@example.com"
              className="w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-surface text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        {testResult?.type === 'email' && (
          <p className={cn('text-xs', testResult.ok ? 'text-green-400' : 'text-red-400')}>{testResult.msg}</p>
        )}
      </div>

      {/* Slack */}
      <div className="border border-border rounded-[var(--radius-lg)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-on-surface-secondary" />
            <span className="text-sm font-medium text-on-surface">
              {isRTL ? 'سلاك' : 'Slack'}
            </span>
          </div>
          <button
            onClick={() => handleTest('slack')}
            className="text-xs px-2 py-1 rounded bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary transition-colors"
          >
            <Send size={12} className="inline mr-1" />
            {isRTL ? 'إرسال تجريبي' : 'Send Test'}
          </button>
        </div>

        <div>
          <label className="block text-xs text-on-surface-tertiary mb-1">
            {isRTL ? 'رابط Webhook' : 'Webhook URL'}
          </label>
          <input
            value={slackWebhookUrl}
            onChange={(e) => setSlackWebhookUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            className="w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-surface text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {testResult?.type === 'slack' && (
          <p className={cn('text-xs', testResult.ok ? 'text-green-400' : 'text-red-400')}>{testResult.msg}</p>
        )}
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm font-medium transition-colors',
          saved
            ? 'bg-green-500/20 text-green-400'
            : 'bg-accent text-on-accent hover:bg-accent-hover'
        )}
      >
        {saving ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Save size={16} />
        )}
        {saved
          ? isRTL ? 'تم الحفظ!' : 'Saved!'
          : isRTL ? 'حفظ' : 'Save'}
      </button>
    </div>
  );
}
