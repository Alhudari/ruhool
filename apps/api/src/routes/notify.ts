// Notifier system (desktop/email/slack) — extracted from index.ts.
// POST /api/notify

import type { Hono } from 'hono';
import nodemailer from 'nodemailer';
import type { StoreData } from '../store/types.js';

export interface NotifyRoutesDeps {
  getStore: () => StoreData;
  logger: { info: (msg: string) => void };
}

export function registerNotifyRoutes(app: Hono, deps: NotifyRoutesDeps): void {
  const { getStore, logger } = deps;

  app.post('/api/notify', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ type: 'desktop' | 'email' | 'slack'; title?: string; message: string; to?: string }>();
    const settings = store.notifications || {};

    if (body.type === 'desktop') {
      logger.info(`[Desktop Notification] ${body.title || 'Ruhool'}: ${body.message}`);
      return c.json({ ok: true, type: 'desktop', note: 'Logged server-side. Use browser Notification API on frontend.' });
    }

    if (body.type === 'email') {
      if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
        return c.json({ error: 'SMTP not configured. Go to Settings > Notifications.' }, 400);
      }
      try {
        const transporter = nodemailer.createTransport({
          host: settings.smtpHost,
          port: settings.smtpPort || 587,
          secure: (settings.smtpPort || 587) === 465,
          auth: { user: settings.smtpUser, pass: settings.smtpPass },
        });
        await transporter.sendMail({
          from: settings.smtpFrom || settings.smtpUser,
          to: body.to || settings.smtpUser,
          subject: body.title || 'Ruhool Notification',
          text: body.message,
        });
        return c.json({ ok: true, type: 'email' });
      } catch (err: unknown) {
        return c.json({ error: err instanceof Error ? err.message : 'Email send failed' }, 500);
      }
    }

    if (body.type === 'slack') {
      if (!settings.slackWebhookUrl) {
        return c.json({ error: 'Slack webhook not configured. Go to Settings > Notifications.' }, 400);
      }
      try {
        const res = await fetch(settings.slackWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `*${body.title || 'Ruhool'}*\n${body.message}` }),
        });
        if (!res.ok) throw new Error(`Slack returned ${res.status}`);
        return c.json({ ok: true, type: 'slack' });
      } catch (err: unknown) {
        return c.json({ error: err instanceof Error ? err.message : 'Slack send failed' }, 500);
      }
    }

    return c.json({ error: 'Invalid notification type' }, 400);
  });
}
