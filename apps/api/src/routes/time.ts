import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';

export interface TimeRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
}

/**
 * Authoritative server time + timezone settings.
 */
export function registerTimeRoutes(app: Hono, deps: TimeRoutesDeps): void {
  const { getStore, saveStore } = deps;

  const getTimezoneConfig = (): { primary: string; secondary?: string } => {
    const s = (getStore() as unknown as { timezones?: { primary: string; secondary?: string } }).timezones;
    return s || { primary: 'Asia/Kuwait', secondary: 'Europe/London' };
  };

  app.get('/api/time', (c) => {
    const now = new Date();
    const cfg = getTimezoneConfig();
    const fmt = (tz: string, locale: string) => new Intl.DateTimeFormat(locale, {
      timeZone: tz, hour12: true,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: 'numeric', minute: '2-digit', second: '2-digit', weekday: 'long',
    }).format(now);
    const fmtAr = (tz: string) => new Intl.DateTimeFormat('ar', {
      timeZone: tz, hour12: true, year: 'numeric', month: 'long', day: 'numeric',
      weekday: 'long', hour: 'numeric', minute: '2-digit',
    }).format(now);
    return c.json({
      iso: now.toISOString(),
      unix: Math.floor(now.getTime() / 1000),
      primary: { tz: cfg.primary, formatted: fmt(cfg.primary, 'en-GB'), formattedAr: fmtAr(cfg.primary) },
      secondary: cfg.secondary ? { tz: cfg.secondary, formatted: fmt(cfg.secondary, 'en-GB'), formattedAr: fmtAr(cfg.secondary) } : null,
    });
  });

  app.get('/api/settings/timezones', (c) => c.json(getTimezoneConfig()));

  app.put('/api/settings/timezones', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ primary: string; secondary?: string }>();
    if (!body.primary) return c.json({ error: 'primary required' }, 400);
    try {
      new Intl.DateTimeFormat('en', { timeZone: body.primary }).format(new Date());
      if (body.secondary) new Intl.DateTimeFormat('en', { timeZone: body.secondary }).format(new Date());
    } catch {
      return c.json({ error: 'Invalid IANA timezone' }, 400);
    }
    (store as unknown as { timezones?: { primary: string; secondary?: string } }).timezones = {
      primary: body.primary, secondary: body.secondary,
    };
    saveStore();
    return c.json({ ok: true, primary: body.primary, secondary: body.secondary });
  });
}
