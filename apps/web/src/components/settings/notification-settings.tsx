'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, Mail, MessageSquare, Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { SaveBar, useSaveBarHeight } from '@/components/settings/save-bar';

interface NotificationData {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  slackWebhookUrl: string;
  desktopEnabled: boolean;
  hasSmtpPass: boolean;
}

type FormValues = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  slackWebhookUrl: string;
  desktopEnabled: boolean;
};

export function NotificationSettings() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [values, setValues] = useState<FormValues>({
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    slackWebhookUrl: '',
    desktopEnabled: true,
  });
  const [original, setOriginal] = useState<FormValues | null>(null);
  const [hasSmtpPass, setHasSmtpPass] = useState(false);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ type: string; ok: boolean; msg: string } | null>(null);

  const setField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<NotificationData>('/api/settings/notifications');
      const loaded: FormValues = {
        smtpHost: data.smtpHost,
        smtpPort: data.smtpPort,
        smtpUser: data.smtpUser,
        smtpPass: '',
        smtpFrom: data.smtpFrom,
        slackWebhookUrl: data.slackWebhookUrl,
        desktopEnabled: data.desktopEnabled,
      };
      setValues(loaded);
      setOriginal(loaded);
      setHasSmtpPass(data.hasSmtpPass);
    } catch {
      // defaults
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const dirty =
    original !== null &&
    (values.smtpHost !== original.smtpHost ||
      values.smtpPort !== original.smtpPort ||
      values.smtpUser !== original.smtpUser ||
      values.smtpPass !== original.smtpPass ||
      values.smtpFrom !== original.smtpFrom ||
      values.slackWebhookUrl !== original.slackWebhookUrl ||
      values.desktopEnabled !== original.desktopEnabled);
  useUnsavedChanges(dirty);
  const saveBarPad = useSaveBarHeight(dirty || !!successMessage);

  const handleSave = async () => {
    setSaving(true);
    setErrorMessage(null);
    try {
      await apiFetch('/api/settings/notifications', {
        method: 'PUT',
        body: JSON.stringify({
          smtpHost: values.smtpHost,
          smtpPort: values.smtpPort,
          smtpUser: values.smtpUser,
          smtpPass: values.smtpPass || undefined,
          smtpFrom: values.smtpFrom,
          slackWebhookUrl: values.slackWebhookUrl,
          desktopEnabled: values.desktopEnabled,
        }),
      });
      setHasSmtpPass(hasSmtpPass || !!values.smtpPass);
      // Keep smtpPass blank in the form after save; password field is write-only
      const newOriginal: FormValues = { ...values, smtpPass: '' };
      setValues(newOriginal);
      setOriginal(newOriginal);
      setSuccessMessage(isRTL ? 'حُفظ' : 'Saved');
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : (isRTL ? 'فشل الحفظ' : 'Save failed'));
    }
    setSaving(false);
  };

  const discard = () => {
    if (!original) return;
    setValues(original);
    setErrorMessage(null);
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
              onClick={() => setField('desktopEnabled', !values.desktopEnabled)}
              className={cn(
                'relative w-10 h-5 rounded-full transition-colors',
                values.desktopEnabled ? 'bg-accent' : 'bg-surface-tertiary'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  values.desktopEnabled ? 'translate-x-5' : 'translate-x-0.5'
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
          <p className={cn('text-xs', testResult.ok ? 'text-success' : 'text-error')}>{testResult.msg}</p>
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
              value={values.smtpHost}
              onChange={(e) => setField('smtpHost', e.target.value)}
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
              value={values.smtpPort}
              onChange={(e) => setField('smtpPort', Number(e.target.value))}
              className="w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-surface text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-on-surface-tertiary mb-1">
              {isRTL ? 'اسم المستخدم' : 'Username'}
            </label>
            <input
              value={values.smtpUser}
              onChange={(e) => setField('smtpUser', e.target.value)}
              className="w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-surface text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-on-surface-tertiary mb-1">
              {isRTL ? 'كلمة المرور' : 'Password'}
            </label>
            <input
              type="password"
              value={values.smtpPass}
              onChange={(e) => setField('smtpPass', e.target.value)}
              placeholder={hasSmtpPass ? '********' : ''}
              className="w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-surface text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-on-surface-tertiary mb-1">
              {isRTL ? 'عنوان المرسل' : 'From Address'}
            </label>
            <input
              value={values.smtpFrom}
              onChange={(e) => setField('smtpFrom', e.target.value)}
              placeholder="noreply@example.com"
              className="w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-surface text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        {testResult?.type === 'email' && (
          <p className={cn('text-xs', testResult.ok ? 'text-success' : 'text-error')}>{testResult.msg}</p>
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
            value={values.slackWebhookUrl}
            onChange={(e) => setField('slackWebhookUrl', e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            className="w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-surface text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {testResult?.type === 'slack' && (
          <p className={cn('text-xs', testResult.ok ? 'text-success' : 'text-error')}>{testResult.msg}</p>
        )}
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
