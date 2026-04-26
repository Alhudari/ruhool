/**
 * Inline SVG chart generators for report emails. Zero-dep string
 * builders — SVG renders natively in Gmail, Outlook, Apple Mail
 * (tested-known-good subset: basic shapes, no <foreignObject>, no
 * external <defs> with filters that some clients drop).
 *
 * All charts return a self-contained <svg ...>...</svg> string sized
 * for a max-width email column (~560px available inside the shell).
 */
import type { TaskItem } from '../../store/types.js';

const W = 560;

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 30-day task completion heatmap (GitHub-style). Each cell = one day.
 * Intensity scales 0..max(completed in any day).
 */
export function chartTasksHeatmap30Days(tasks: TaskItem[], nowIso: string = new Date().toISOString()): string {
  const today = new Date(nowIso);
  today.setUTCHours(0, 0, 0, 0);
  const days: { iso: string; count: number }[] = [];
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const iso = d.toISOString().slice(0, 10);
    days.push({ iso, count: 0 });
  }
  for (const t of tasks) {
    if (!t.completed || !t.completedAt) continue;
    const iso = t.completedAt.slice(0, 10);
    const hit = days.find((x) => x.iso === iso);
    if (hit) hit.count += 1;
  }
  const max = Math.max(1, ...days.map((d) => d.count));
  const cell = 14;
  const gap = 3;
  const rows = 5;
  const cols = 6;  // 5×6 = 30
  const chartW = cols * (cell + gap) - gap;
  const chartH = rows * (cell + gap) - gap;
  const offsetX = (W - chartW) / 2;
  const cells: string[] = [];
  for (let i = 0; i < days.length; i += 1) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = offsetX + col * (cell + gap);
    const y = 50 + row * (cell + gap);
    const intensity = days[i].count / max;
    // Warm green gradient ramp, visible even at 0 so the grid is obvious.
    const fill = intensity === 0
      ? '#ebe8df'
      : intensity < 0.25 ? '#c9e4c5'
      : intensity < 0.5 ? '#8dcc7c'
      : intensity < 0.75 ? '#4e9a3d'
      : '#2d6a24';
    const tt = `${days[i].iso}: ${days[i].count}`;
    cells.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${fill}"><title>${escapeXml(tt)}</title></rect>`);
  }
  const total = days.reduce((s, d) => s + d.count, 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${chartH + 70}" viewBox="0 0 ${W} ${chartH + 70}" font-family="-apple-system,Segoe UI,Tahoma,Arial,sans-serif">
  <text x="${W / 2}" y="28" text-anchor="middle" font-size="14" font-weight="600" fill="#333">آخر ٣٠ يوماً · ${total} مهمة مكتملة</text>
  ${cells.join('\n  ')}
</svg>`;
}

/**
 * Horizontal bar chart: tasks by priority. One bar per priority level
 * present. `open` vs `completed` stacked per bar.
 */
export function chartTasksByPriority(tasks: TaskItem[]): string {
  const levels = ['high', 'medium', 'low', 'none'] as const;
  const labels: Record<string, string> = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة', none: 'بدون' };
  const counts: Record<string, { open: number; done: number }> = {};
  for (const lvl of levels) counts[lvl] = { open: 0, done: 0 };
  for (const t of tasks) {
    if (t.isHabit) continue;
    const key = counts[t.priority ?? 'none'] ? (t.priority ?? 'none') : 'none';
    if (t.completed) counts[key].done += 1; else counts[key].open += 1;
  }
  const max = Math.max(1, ...levels.map((l) => counts[l].open + counts[l].done));
  const rowH = 28;
  const rowGap = 10;
  const labelW = 80;
  const barAreaW = W - labelW - 60;
  const rows: string[] = [];
  let y = 40;
  for (const lvl of levels) {
    const open = counts[lvl].open;
    const done = counts[lvl].done;
    const total = open + done;
    const openW = (open / max) * barAreaW;
    const doneW = (done / max) * barAreaW;
    rows.push(`
      <text x="${W - 10}" y="${y + 18}" text-anchor="end" font-size="13" fill="#444" direction="rtl">${escapeXml(labels[lvl])}</text>
      <rect x="${labelW}" y="${y}" width="${openW}" height="${rowH}" rx="4" fill="#d8cfa8"><title>مفتوحة: ${open}</title></rect>
      <rect x="${labelW + openW}" y="${y}" width="${doneW}" height="${rowH}" rx="4" fill="#4e9a3d"><title>مكتملة: ${done}</title></rect>
      <text x="${labelW + openW + doneW + 6}" y="${y + 18}" font-size="12" fill="#666">${total}</text>
    `);
    y += rowH + rowGap;
  }
  const height = y + 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" font-family="-apple-system,Segoe UI,Tahoma,Arial,sans-serif">
  <text x="${W / 2}" y="22" text-anchor="middle" font-size="14" font-weight="600" fill="#333">المهام حسب الأولوية</text>
  ${rows.join('')}
</svg>`;
}

/**
 * Bundles a report's data-driven charts into a single HTML block
 * suitable for inlining in the email body markdown-to-html pipeline.
 */
export function buildReportCharts(opts: { tasks: TaskItem[] }): string {
  const heatmap = chartTasksHeatmap30Days(opts.tasks);
  const priority = chartTasksByPriority(opts.tasks);
  return `
<div style="margin:20px 0;text-align:center;">
  <div style="margin:16px 0;">${heatmap}</div>
  <div style="margin:16px 0;">${priority}</div>
</div>`;
}
