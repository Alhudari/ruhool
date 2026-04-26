import { describe, it, expect } from 'vitest';
import { chartTasksHeatmap30Days, chartTasksByPriority, buildReportCharts } from './charts.js';
import type { TaskItem } from '../../store/types.js';

const task = (o: Partial<TaskItem> = {}): TaskItem => ({
  id: o.id ?? 'x',
  title: 't',
  notes: '',
  completed: false,
  priority: 'none',
  dueDate: null,
  dueTime: null,
  list: 'عام',
  tags: [],
  color: '',
  pinned: false,
  checklist: [],
  reminder: null,
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
  completedAt: null,
  ...o,
} as TaskItem);

describe('chartTasksHeatmap30Days', () => {
  it('renders a 5×6 grid of 30 cells for no-activity', () => {
    const svg = chartTasksHeatmap30Days([], '2026-06-01T00:00:00Z');
    const cellCount = (svg.match(/<rect /g) ?? []).length;
    expect(cellCount).toBe(30);
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="560"');
    expect(svg).toContain('0 مهمة مكتملة');
  });

  it('colors days proportionally by completion count', () => {
    const today = '2026-06-01T00:00:00Z';
    const tasks = [
      task({ completed: true, completedAt: '2026-06-01T10:00:00Z' }),
      task({ completed: true, completedAt: '2026-06-01T11:00:00Z' }),
      task({ completed: true, completedAt: '2026-06-01T12:00:00Z' }),
    ];
    const svg = chartTasksHeatmap30Days(tasks, today);
    // The day "2026-06-01" should have a tooltip showing 3.
    expect(svg).toContain('2026-06-01: 3');
    // Total label reflects 3 completed.
    expect(svg).toContain('3 مهمة مكتملة');
  });

  it('ignores not-completed tasks', () => {
    const tasks = [
      task({ completed: false, completedAt: null }),
      task({ completed: true, completedAt: null }),
    ];
    const svg = chartTasksHeatmap30Days(tasks, '2026-06-01T00:00:00Z');
    expect(svg).toContain('0 مهمة مكتملة');
  });
});

describe('chartTasksByPriority', () => {
  it('renders 4 rows (high/medium/low/none)', () => {
    const svg = chartTasksByPriority([]);
    for (const label of ['عالية', 'متوسطة', 'منخفضة', 'بدون']) {
      expect(svg).toContain(label);
    }
  });

  it('stacks open vs done per priority', () => {
    const tasks = [
      task({ priority: 'high', completed: false }),
      task({ priority: 'high', completed: true }),
      task({ priority: 'high', completed: true }),
    ];
    const svg = chartTasksByPriority(tasks);
    expect(svg).toContain('مفتوحة: 1');
    expect(svg).toContain('مكتملة: 2');
  });

  it('skips habits', () => {
    const tasks = [
      task({ priority: 'high', isHabit: true }),
      task({ priority: 'high', completed: false }),
    ];
    const svg = chartTasksByPriority(tasks);
    expect(svg).toContain('مفتوحة: 1');
  });
});

describe('buildReportCharts', () => {
  it('returns HTML wrapping both charts', () => {
    const html = buildReportCharts({ tasks: [] });
    expect(html.match(/<svg/g)?.length).toBe(2);
    expect(html).toContain('text-align:center');
  });
});
