const res = await fetch('http://127.0.0.1:3001/api/chat', {
  method: 'POST',
  headers: { 'Content-Type':'application/json', 'Accept':'text/event-stream' },
  body: JSON.stringify({ message: '@الراعي عرّفوا بعضكم في 3 جولات: 1 عبدان 2 شواشة 3 الصفرا' })
});
console.log('status:', res.status);
if (!res.ok) {
  console.log('body:', await res.text());
  process.exit(1);
}
const reader = res.body.getReader();
const dec = new TextDecoder();
let raw = '';
const start = Date.now();
while (Date.now()-start < 120000) {
  const {done,value}=await reader.read();
  if (done) break;
  raw += dec.decode(value,{stream:true});
  if (raw.match(/event: done$/m)) break;
}
console.log('events:', raw.match(/^event: (\S+)/gm)?.length);
console.log('legacy text:', (raw.match(/event: text\n/g) || []).length);
console.log('legacy content:', (raw.match(/event: content\n/g) || []).length);
console.log('legacy delegations:', (raw.match(/event: delegations\n/g) || []).length);
console.log('legacy tool_result:', (raw.match(/event: tool_result\n/g) || []).length);
console.log('v2 message.start:', (raw.match(/event: message\.start\n/g) || []).length);
console.log('v2 message.delta:', (raw.match(/event: message\.delta\n/g) || []).length);
console.log('v2 message.done:', (raw.match(/event: message\.done\n/g) || []).length);
console.log('errors:', (raw.match(/event: error\n/g) || []).length);
console.log('pings:', (raw.match(/event: ping\n/g) || []).length);
const errs = [...raw.matchAll(/event: error\s*\ndata: ([^\n]+)/g)];
errs.forEach(e => console.log('  ERR:', e[1]));
// Count unique manager bubbles (kind= handoff or text with agentId=manager)
const starts = [...raw.matchAll(/event: message\.start\s*\ndata: ([^\n]+)/g)];
let managerStarts = 0;
for (const m of starts) {
  try { const j = JSON.parse(m[1]); if (j.agentId === 'manager') managerStarts++; } catch {}
}
console.log('manager.start count:', managerStarts);
