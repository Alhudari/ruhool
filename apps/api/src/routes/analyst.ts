import type { Hono } from 'hono';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { StoreData } from '../store/types.js';
import type { CapabilityResult } from '../services/capability-checkers.js';
import type { SubscriptionRecord } from './subscriptions.js';

type CostLine = { service: string; units: number; unitName: string; usd: number };
type RenderMetaLike = { costUSD?: number; renderedAt: string };

export interface AnalystRoutesDeps {
  getStore: () => StoreData;
  capabilityCheckers: Record<string, (key: string) => Promise<Record<string, CapabilityResult>>>;
  listRenders: () => Array<{ renderedAt: string; costUSD?: number }>;
  statementsDir: string;
}

/**
 * Build the analyst snapshot markdown with capability checks + historical usage.
 * Extracted from index.ts buildSubscriptionSnapshot (REL-01 stage 2d, step 4).
 */
export function buildSubscriptionSnapshot(deps: AnalystRoutesDeps): () => Promise<string> {
  const { getStore, capabilityCheckers, listRenders } = deps;
  return async function (): Promise<string> {
    const store = getStore();
    const lines: string[] = [];
    const now = new Date();
    lines.push(`**التاريخ**: ${now.toISOString().slice(0, 10)}`);
    lines.push('');

    const keys = ((store as unknown as { apiKeys?: Record<string, string> }).apiKeys || {}) as Record<string, string>;
    const checks: Array<Promise<void>> = [];
    const results: Record<string, Record<string, CapabilityResult>> = {};
    for (const [field, checker] of Object.entries(capabilityCheckers)) {
      const v = keys[field];
      if (!v) { results[field] = {}; continue; }
      checks.push(checker(v).then((r) => { results[field] = r; }).catch(() => { results[field] = {}; }));
    }
    await Promise.all(checks);

    const services = [
      { id: 'mapboxToken',      name: 'Mapbox',         freeQuota: '50,000 static maps/month' },
      { id: 'maptilerKey',      name: 'MapTiler',       freeQuota: '100,000 tiles/month' },
      { id: 'geoapifyKey',      name: 'Geoapify',       freeQuota: '3,000 requests/day' },
      { id: 'thunderforestKey', name: 'Thunderforest',  freeQuota: '150,000 tiles/month' },
      { id: 'elevenlabsApiKey', name: 'ElevenLabs',     freeQuota: '10,000 chars/month free' },
      { id: 'stableAudioKey',   name: 'Stable Audio',   freeQuota: '25 free credits on signup' },
      { id: 'groqApiKey',       name: 'Groq Whisper',   freeQuota: '14,400 requests/day' },
      { id: 'lumaApiKey',       name: 'Luma AI',        freeQuota: 'Pay-as-you-go' },
    ];
    for (const s of services) {
      const connected = !!keys[s.id];
      const caps = results[s.id] || {};
      const anyOk = Object.values(caps).some((c) => c.ok);
      const statusEmoji = !connected ? '\u26aa' : anyOk ? '\ud83d\udfe2' : '\ud83d\udd34';
      lines.push(`### ${statusEmoji} ${s.name}`);
      lines.push(`- Free quota: ${s.freeQuota}`);
      if (!connected) {
        lines.push('- الحالة: غير مربوط');
      } else {
        for (const [cap, info] of Object.entries(caps)) {
          lines.push(`- ${cap}: ${info.ok ? '\u2713' : '\u2717'} ${info.message}`);
        }
      }
      lines.push('');
    }

    try {
      const renders = listRenders();
      const last7 = renders.filter((r) => {
        const diff = Date.now() - new Date(r.renderedAt).getTime();
        return diff < 7 * 24 * 60 * 60 * 1000;
      });
      const last30 = renders.filter((r) => {
        const diff = Date.now() - new Date(r.renderedAt).getTime();
        return diff < 30 * 24 * 60 * 60 * 1000;
      });
      const sumCost = (arr: RenderMetaLike[]) => arr.reduce((s, r) => s + ((r.costUSD as number) || 0), 0);
      lines.push('### الاستخدام الفعلي');
      lines.push(`- آخر 7 أيام: ${last7.length} فيديو — $${sumCost(last7 as RenderMetaLike[]).toFixed(4)}`);
      lines.push(`- آخر 30 يوم: ${last30.length} فيديو — $${sumCost(last30 as RenderMetaLike[]).toFixed(4)}`);
      lines.push(`- إجمالي: ${renders.length} فيديو`);

      const serviceCosts: Record<string, number> = {};
      for (const r of last30) {
        const lines2 = (r as unknown as { costLines?: CostLine[] }).costLines || [];
        for (const l of lines2) {
          serviceCosts[l.service] = (serviceCosts[l.service] || 0) + l.usd;
        }
      }
      if (Object.keys(serviceCosts).length > 0) {
        lines.push('- تفصيل آخر 30 يوم:');
        for (const [svc, cost] of Object.entries(serviceCosts).sort((a, b) => b[1] - a[1])) {
          lines.push(`  - ${svc}: $${cost.toFixed(4)}`);
        }
      }
    } catch { /* ignore */ }

    return lines.join('\n');
  };
}

/**
 * /api/analyst/* routes (snapshot, statement upload, bank-statement PDF parse).
 */
export function registerAnalystRoutes(app: Hono, deps: AnalystRoutesDeps): void {
  const { getStore, statementsDir } = deps;
  fs.mkdirSync(statementsDir, { recursive: true });

  const snapshotFn = buildSubscriptionSnapshot(deps);

  app.get('/api/analyst/snapshot', async (c) => {
    const snapshot = await snapshotFn();
    return c.json({ snapshot, generatedAt: new Date().toISOString() });
  });

  // Upload a bank statement PDF (raw storage; processing deferred)
  app.post('/api/analyst/statement/upload', async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!file || typeof file === 'string') return c.json({ error: 'No file' }, 400);
    const f = file as File;
    const id = crypto.randomUUID().slice(0, 8);
    const filename = `${id}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    fs.writeFileSync(path.join(statementsDir, filename), Buffer.from(await f.arrayBuffer()));
    return c.json({ ok: true, id, filename, note: 'Statement saved. Analyst will process it when feature goes live.' });
  });

  // Parse bank statement PDF → match transactions against subscriptions
  app.post('/api/analyst/parse-bank-statement', async (c) => {
    try {
      const form = await c.req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return c.json({ error: 'No file uploaded' }, 400);
      const bytes = Buffer.from(await file.arrayBuffer());

      const pdfMod = await import('pdf-parse');
      const PDFParseCtor = (pdfMod as unknown as { PDFParse?: new (opts: { data: Buffer }) => { getText(): Promise<{ text: string; numpages?: number }> }; default?: (b: Buffer) => Promise<{ text: string; numpages: number }> });
      let text = '';
      let numpages = 0;
      if (PDFParseCtor.PDFParse) {
        const parser = new PDFParseCtor.PDFParse({ data: bytes });
        const out = await parser.getText();
        text = out.text || '';
        numpages = out.numpages || 0;
      } else if (PDFParseCtor.default) {
        const parsedDoc = await PDFParseCtor.default(bytes);
        text = parsedDoc.text || '';
        numpages = parsedDoc.numpages || 0;
      }

      const lineRe = /^(?<date>\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\s+(?<desc>.+?)\s+(?<amount>-?[\d,]+\.\d{2})(?:\s*(?<dc>Cr|Dr|CR|DR))?\s*$/gm;

      const txs: Array<{ date: string; description: string; amount: number; direction?: 'credit' | 'debit' }> = [];
      let m: RegExpExecArray | null;
      while ((m = lineRe.exec(text)) !== null) {
        const g = m.groups!;
        const amount = parseFloat(g.amount.replace(/,/g, ''));
        if (!isFinite(amount)) continue;
        const dir = g.dc ? (g.dc.toLowerCase() === 'cr' ? 'credit' : 'debit') : undefined;
        txs.push({ date: g.date, description: g.desc.trim().replace(/\s{2,}/g, ' '), amount, direction: dir });
      }

      const store = getStore();
      const subs = ((store as unknown as { subscriptions?: SubscriptionRecord[] }).subscriptions || []);
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF ]+/g, '').replace(/\s+/g, ' ').trim();
      const results = txs.map((tx) => {
        const descN = normalize(tx.description);
        const candidates = subs.filter((s) => {
          const name = normalize(s.name || '');
          const prov = normalize(s.provider || '');
          return (name && descN.includes(name)) || (prov && descN.includes(prov));
        });
        if (candidates.length === 0) {
          return { ...tx, status: 'unknown' as const };
        }
        const best = candidates[0];
        const absAmount = Math.abs(tx.amount);
        const sameAmount = best.amount != null && Math.abs(best.amount - absAmount) < 0.02;
        return {
          ...tx,
          status: sameAmount ? ('match' as const) : ('discrepancy' as const),
          subscriptionId: best.id,
          subscriptionName: best.name,
          expectedAmount: best.amount,
          expectedCurrency: best.currency,
        };
      });

      const summary = {
        totalTransactions: results.length,
        matched: results.filter((r) => r.status === 'match').length,
        discrepancies: results.filter((r) => r.status === 'discrepancy').length,
        unknown: results.filter((r) => r.status === 'unknown').length,
        pages: numpages,
      };

      return c.json({ ok: true, summary, transactions: results });
    } catch (err: unknown) {
      return c.json({ error: err instanceof Error ? err.message : 'Parse failed' }, 500);
    }
  });
}
