#!/usr/bin/env node
/**
 * Bulk advisory audit against npm registry (replaces deprecated /audits endpoint).
 * Parses pnpm-lock.yaml, extracts unique pkg@version pairs, POSTs to
 * https://registry.npmjs.org/-/npm/v1/security/advisories/bulk in batches,
 * filters advisories by installed versions, groups by severity.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lockPath = resolve(process.cwd(), 'pnpm-lock.yaml');
const text = readFileSync(lockPath, 'utf8');

// Parse pnpm v9 lockfile: keys like `/name@version(peer)` or `/@scope/name@version`
// under `packages:` and `snapshots:`. We only need name@version.
const pkgs = new Map(); // name -> Set(versions)
const keyRe = /^ {2}'?([^'\s][^\s:]*?)'?:\s*$/; // lines under packages:
let inPackages = false;
for (const line of text.split(/\r?\n/)) {
  if (/^packages:\s*$/.test(line)) { inPackages = true; continue; }
  if (inPackages && /^\S/.test(line)) { inPackages = false; }
  if (!inPackages) continue;
  // Package keys look like:   /name@1.2.3:   or   '/name@1.2.3(peer)':   or name@1.2.3:
  const m = line.match(/^ {2}'?(@?[^@'\s]+(?:\/[^@'\s]+)?)@([^'():\s]+)/);
  if (m) {
    const name = m[1];
    const version = m[2];
    if (!pkgs.has(name)) pkgs.set(name, new Set());
    pkgs.get(name).add(version);
  }
}

// Build payload: { name: [versions...] }
const payload = {};
for (const [name, vs] of pkgs) payload[name] = [...vs];

const allNames = Object.keys(payload);
console.error(`Found ${allNames.length} unique packages across ${Object.values(payload).reduce((a,b)=>a+b.length,0)} installed versions.`);

async function queryBatch(batch) {
  const res = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

function satisfies(version, range) {
  // Very small semver-range check limited to the ops npm uses:
  // "<x", "<=x", ">=x", ">x", ">=x <y", ">x <=y", etc.
  // Returns true if `version` is within `range`.
  const v = parseVer(version);
  if (!v) return false;
  const parts = range.split(/\s+/).filter(Boolean);
  for (const p of parts) {
    const m = p.match(/^(>=|<=|>|<|=)?\s*(\d+\.\d+\.\d+[^ ]*)$/);
    if (!m) return false;
    const op = m[1] || '=';
    const target = parseVer(m[2]);
    if (!target) return false;
    const cmp = cmpVer(v, target);
    if (op === '<' && !(cmp < 0)) return false;
    if (op === '<=' && !(cmp <= 0)) return false;
    if (op === '>' && !(cmp > 0)) return false;
    if (op === '>=' && !(cmp >= 0)) return false;
    if (op === '=' && !(cmp === 0)) return false;
  }
  return true;
}
function parseVer(s) {
  const m = s.match(/^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?/);
  if (!m) return null;
  return { major:+m[1], minor:+m[2], patch:+m[3], pre: m[4]||'' };
}
function cmpVer(a, b) {
  if (a.major!==b.major) return a.major-b.major;
  if (a.minor!==b.minor) return a.minor-b.minor;
  if (a.patch!==b.patch) return a.patch-b.patch;
  if (a.pre === b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  return a.pre < b.pre ? -1 : 1;
}

// Batch (registry limits body size; chunk ~200 packages per call)
const chunkSize = 150;
const findings = []; // { name, version, severity, title, url, range, id }
for (let i = 0; i < allNames.length; i += chunkSize) {
  const names = allNames.slice(i, i + chunkSize);
  const batch = Object.fromEntries(names.map(n => [n, payload[n]]));
  let advisories;
  try {
    advisories = await queryBatch(batch);
  } catch (e) {
    console.error(`Batch ${i/chunkSize}: ${e.message}`);
    continue;
  }
  for (const [name, advs] of Object.entries(advisories)) {
    for (const adv of advs) {
      for (const v of payload[name]) {
        if (satisfies(v, adv.vulnerable_versions)) {
          findings.push({
            name, version: v,
            severity: adv.severity,
            title: adv.title,
            url: adv.url,
            range: adv.vulnerable_versions,
            id: adv.id,
            cwe: adv.cwe,
            cvss: adv.cvss?.score,
          });
        }
      }
    }
  }
}

const bySev = { critical:[], high:[], moderate:[], low:[], info:[] };
for (const f of findings) (bySev[f.severity]||bySev.info).push(f);

const summary = {
  scannedPackages: allNames.length,
  scannedVersions: Object.values(payload).reduce((a,b)=>a+b.length,0),
  totals: Object.fromEntries(Object.entries(bySev).map(([k,v])=>[k,v.length])),
  findings,
};
console.log(JSON.stringify(summary, null, 2));
