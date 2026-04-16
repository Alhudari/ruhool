// Map tiles / static maps proxy — extracted from index.ts (REL-01 stage 2d cleanup).
// Keeps provider tokens server-side. Client passes ?url=... with a placeholder OR a
// bare URL and ?provider=mapbox|maptiler|geoapify|thunderforest. We inject the token
// and (by default) stream the image back inline. Pass ?asBase64=1 to get a data URL.

import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';

export interface MapsRoutesDeps {
  getStore: () => StoreData;
}

export function registerMapsRoutes(app: Hono, deps: MapsRoutesDeps): void {
  const { getStore } = deps;

  app.get('/api/maps/proxy', async (c) => {
    const store = getStore();
    const url = c.req.query('url');
    const provider = (c.req.query('provider') || 'mapbox').toLowerCase();
    const asBase64 = c.req.query('asBase64') === '1';
    if (!url) return c.json({ error: 'Missing url' }, 400);

    const apiKeys = (store.apiKeys || {}) as Record<string, string>;
    const tokenFieldByProvider: Record<string, string> = {
      mapbox: 'mapboxToken',
      maptiler: 'maptilerKey',
      geoapify: 'geoapifyKey',
      thunderforest: 'thunderforestKey',
    };
    const tokenField = tokenFieldByProvider[provider];
    if (!tokenField) return c.json({ error: `Unsupported provider: ${provider}` }, 400);
    const token = apiKeys[tokenField];
    if (!token) return c.json({ error: `No ${provider} token configured` }, 400);

    // Host allowlist — don't let the proxy fetch arbitrary URLs
    const allowedHosts: Record<string, RegExp> = {
      mapbox: /^api\.mapbox\.com$/i,
      maptiler: /^api\.maptiler\.com$/i,
      geoapify: /^maps\.geoapify\.com$/i,
      thunderforest: /^(?:[a-z]\.)?tile\.thunderforest\.com$/i,
    };
    let target: URL;
    try { target = new URL(url); } catch { return c.json({ error: 'Invalid url' }, 400); }
    if (!allowedHosts[provider].test(target.hostname)) {
      return c.json({ error: `Host ${target.hostname} not allowed for ${provider}` }, 400);
    }

    // Token placeholder substitution + param injection
    let targetUrl = target.toString().replace(/__MAPBOX_TOKEN__|__MAPTILER_KEY__|__GEOAPIFY_KEY__|__THUNDERFOREST_KEY__/g, token);
    if (provider === 'mapbox' && !/[?&]access_token=/.test(targetUrl)) {
      targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(token);
    } else if ((provider === 'maptiler' || provider === 'thunderforest' || provider === 'geoapify') && !/[?&](key|apiKey)=/.test(targetUrl)) {
      const param = provider === 'geoapify' ? 'apiKey' : 'key';
      targetUrl += (targetUrl.includes('?') ? '&' : '?') + param + '=' + encodeURIComponent(token);
    }

    try {
      const res = await fetch(targetUrl);
      if (!res.ok) return c.json({ error: `Upstream HTTP ${res.status}` }, 502);
      const contentType = res.headers.get('content-type') || 'image/png';
      const buf = Buffer.from(await res.arrayBuffer());
      if (asBase64) {
        return c.json({ dataUrl: `data:${contentType};base64,${buf.toString('base64')}`, contentType, bytes: buf.length });
      }
      return new Response(buf, {
        status: 200,
        headers: {
          'content-type': contentType,
          'cache-control': 'public, max-age=86400',
        },
      });
    } catch (err: unknown) {
      return c.json({ error: err instanceof Error ? err.message : 'Proxy fetch failed' }, 500);
    }
  });
}
