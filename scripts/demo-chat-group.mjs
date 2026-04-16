/**
 * Wave E runtime verification — drives real browser against live API+Web
 * servers, flips the CHAT_V2 client flag in localStorage, exercises the
 * three WhatsApp-group scenarios, and captures screenshots + SSE traces.
 *
 * Prereqs (assumed running):
 *   - API on http://127.0.0.1:3001  (with env CHAT_V2=true)
 *   - Web on http://127.0.0.1:3000
 *   - An Anthropic API key configured in data/.store.json settings
 *
 * Usage:   node scripts/demo-chat-group.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('docs/screenshots');
fs.mkdirSync(OUT, { recursive: true });

const API = 'http://127.0.0.1:3001';
const WEB = 'http://127.0.0.1:3000';

/**
 * Send a chat message to the API and collect the full SSE stream.
 * Returns {conversationId, events:[{event,data}], raw}.
 */
async function sendAndCollect(message, { conversationId } = {}) {
  const body = conversationId ? { conversationId, message } : { message };
  const res = await fetch(`${API}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`chat ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const events = [];
  let convId = conversationId || null;
  const startedAt = Date.now();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    // Parse SSE frames split by blank line
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const lines = frame.split('\n');
      let ev = 'message';
      const datas = [];
      for (const l of lines) {
        if (l.startsWith('event:')) ev = l.slice(6).trim();
        else if (l.startsWith('data:')) datas.push(l.slice(5).trim());
      }
      const raw = datas.join('\n');
      let parsed = raw;
      try { parsed = JSON.parse(raw); } catch {}
      events.push({ t: Date.now() - startedAt, event: ev, data: parsed });
      if (ev === 'conversation' && parsed?.conversationId) convId = parsed.conversationId;
      if (ev === 'done') {
        try { reader.cancel(); } catch {}
        return { conversationId: convId, events };
      }
    }
    // Hard-cap after 60s to avoid hanging
    if (Date.now() - startedAt > 60_000) {
      try { reader.cancel(); } catch {}
      break;
    }
  }
  return { conversationId: convId, events };
}

function formatTrace(scenario, out) {
  const lines = [];
  lines.push(`# SSE trace — ${scenario}`);
  lines.push(`conversationId: ${out.conversationId}`);
  lines.push(`event count: ${out.events.length}`);
  lines.push('');
  // Summarise
  const summary = {};
  for (const e of out.events) summary[e.event] = (summary[e.event] || 0) + 1;
  lines.push('## event counts');
  for (const [k, v] of Object.entries(summary)) lines.push(`  ${k}: ${v}`);
  lines.push('');
  lines.push('## ordered events (t ms, event, data-summary)');
  for (const e of out.events) {
    let s = '';
    if (typeof e.data === 'string') s = e.data.slice(0, 120);
    else if (e.data && typeof e.data === 'object') {
      if (e.event === 'text' && e.data.content) s = `+${String(e.data.content).length}ch`;
      else s = JSON.stringify(e.data).slice(0, 200);
    }
    lines.push(`  ${String(e.t).padStart(6)} ${e.event.padEnd(16)} ${s}`);
  }
  return lines.join('\n');
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Flip CHAT_V2 client flag before any page loads
  await context.addInitScript(() => {
    try { window.localStorage.setItem('ruhool-features-chat-v2', '1'); } catch {}
  });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('[browser err]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  // Landing
  await page.goto(WEB, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, 'chat-group-landing.png'), fullPage: true });
  console.log('saved chat-group-landing.png');

  // --- Scenario 1: first message ------------------------------------
  console.log('\n=== scenario 1: first message (@الراعي مرحبا) ===');
  const s1 = await sendAndCollect('@الراعي مرحبا');
  console.log(`  conversationId=${s1.conversationId}, events=${s1.events.length}`);
  fs.writeFileSync(path.join(OUT, 'chat-group-first-message-sse.txt'), formatTrace('first-message', s1));

  // Render that conversation in the browser
  await page.goto(`${WEB}/chat/${s1.conversationId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(OUT, 'chat-group-first-message.png'), fullPage: true });
  console.log('  saved chat-group-first-message.png');

  // --- Scenario 2: multi-mention ------------------------------------
  console.log('\n=== scenario 2: multi-mention (@عبدان @شواشة) ===');
  const s2 = await sendAndCollect('@عبدان @شواشة عرّفوا نفسكم باختصار');
  console.log(`  conversationId=${s2.conversationId}, events=${s2.events.length}`);
  fs.writeFileSync(path.join(OUT, 'chat-group-multi-mention-sse.txt'), formatTrace('multi-mention', s2));

  await page.goto(`${WEB}/chat/${s2.conversationId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(OUT, 'chat-group-multi-mention.png'), fullPage: true });
  console.log('  saved chat-group-multi-mention.png');

  // --- Scenario 3: delegation --------------------------------------
  console.log('\n=== scenario 3: delegation (@الراعي أوكل عبدان) ===');
  const s3 = await sendAndCollect('@الراعي أوكل عبدان ببحث سريع عن BIM في الكويت');
  console.log(`  conversationId=${s3.conversationId}, events=${s3.events.length}`);
  fs.writeFileSync(path.join(OUT, 'chat-group-delegation-sse.txt'), formatTrace('delegation', s3));

  await page.goto(`${WEB}/chat/${s3.conversationId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: path.join(OUT, 'chat-group-delegation.png'), fullPage: true });
  console.log('  saved chat-group-delegation.png');

  // Sanity summary to stdout
  console.log('\n=== DONE ===');
  const files = fs.readdirSync(OUT).filter((f) => f.startsWith('chat-group-'));
  for (const f of files) console.log('  ', f);

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
