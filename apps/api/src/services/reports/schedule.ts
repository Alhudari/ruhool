/**
 * Report schedule math — computes `nextRunAt` for a given schedule.
 *
 * Timezone note: everything is stored in UTC ISO strings. The schedule
 * carries a timezone (e.g. "Asia/Kuwait"); we convert the user's
 * local wall-clock intent to UTC using Intl.DateTimeFormat's parts.
 * No external deps.
 */
import type { ReportSchedule } from '../../store/types.js';

/**
 * Returns the UTC offset (in minutes) of the given timezone at the
 * given instant. Positive for east-of-UTC. "Asia/Kuwait" → +180.
 */
function tzOffsetMinutes(tz: string, instant: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(instant).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/**
 * Given a "local wall clock" (year/month/day/hour/minute) in tz, return
 * the UTC Date that corresponds to it.
 */
function localToUtc(tz: string, year: number, month: number, day: number, hour: number, minute: number): Date {
  // First approximation: treat the wall clock as UTC.
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  // Offset at that approximate instant.
  const offset = tzOffsetMinutes(tz, guess);
  // Subtract the offset to get the true UTC moment.
  return new Date(guess.getTime() - offset * 60000);
}

function ymdInTz(tz: string, instant: Date): { year: number; month: number; day: number; hour: number; minute: number; dow: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  });
  const parts = fmt.formatToParts(instant).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    dow: dowMap[parts.weekday] ?? 0,
  };
}

/**
 * Compute the next UTC instant at which the schedule should fire, strictly after `after`.
 * Returns null for `once` schedules that have already passed, and for `manual`.
 */
export function computeNextRunAt(schedule: ReportSchedule, after: Date = new Date()): string | null {
  if (schedule.type === 'manual') return null;

  if (schedule.type === 'once') {
    const t = new Date(schedule.at).getTime();
    return isNaN(t) || t <= after.getTime() ? null : new Date(t).toISOString();
  }

  const tz = schedule.timezone;
  const { year, month, day, dow } = ymdInTz(tz, after);

  if (schedule.type === 'daily') {
    // Try today at hh:mm local; if that's <= after, advance one day.
    let candidate = localToUtc(tz, year, month, day, schedule.hour, schedule.minute);
    if (candidate.getTime() <= after.getTime()) {
      // Advance local day by 1.
      const tomorrow = new Date(Date.UTC(year, month - 1, day) + 24 * 3600 * 1000);
      const ymd = ymdInTz(tz, tomorrow);
      candidate = localToUtc(tz, ymd.year, ymd.month, ymd.day, schedule.hour, schedule.minute);
    }
    return candidate.toISOString();
  }

  if (schedule.type === 'weekly') {
    // Days until target DOW (0=Sun..6=Sat). If today, also check time.
    let delta = (schedule.dayOfWeek - dow + 7) % 7;
    let candidate = localToUtc(tz, year, month, day, schedule.hour, schedule.minute);
    if (delta === 0 && candidate.getTime() <= after.getTime()) delta = 7;
    if (delta > 0) {
      const future = new Date(Date.UTC(year, month - 1, day) + delta * 24 * 3600 * 1000);
      const ymd = ymdInTz(tz, future);
      candidate = localToUtc(tz, ymd.year, ymd.month, ymd.day, schedule.hour, schedule.minute);
    }
    return candidate.toISOString();
  }

  if (schedule.type === 'monthly') {
    // Target day this month at hh:mm. If past, advance to next month.
    let y = year;
    let m = month;
    const dayOf = Math.min(28, Math.max(1, schedule.dayOfMonth));
    let candidate = localToUtc(tz, y, m, dayOf, schedule.hour, schedule.minute);
    if (candidate.getTime() <= after.getTime()) {
      m += 1; if (m > 12) { m = 1; y += 1; }
      candidate = localToUtc(tz, y, m, dayOf, schedule.hour, schedule.minute);
    }
    return candidate.toISOString();
  }

  return null;
}

/** Human-readable summary for a schedule — used by the UI. */
export function describeSchedule(schedule: ReportSchedule): string {
  if (schedule.type === 'manual') return 'يدوي فقط';
  if (schedule.type === 'once') return `مرة واحدة: ${schedule.at}`;
  const hm = `${String((schedule as { hour: number }).hour).padStart(2, '0')}:${String((schedule as { minute: number }).minute).padStart(2, '0')}`;
  if (schedule.type === 'daily') return `يومياً الساعة ${hm}`;
  if (schedule.type === 'weekly') {
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    return `أسبوعياً يوم ${days[schedule.dayOfWeek] ?? '?'} الساعة ${hm}`;
  }
  if (schedule.type === 'monthly') return `شهرياً يوم ${schedule.dayOfMonth} الساعة ${hm}`;
  return 'غير معروف';
}
