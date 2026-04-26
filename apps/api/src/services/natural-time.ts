/**
 * Parses Arabic and English natural language time expressions
 * relative to `now` (defaults to new Date()).
 * Returns ISO string or null if unparseable.
 * A-4: Natural Language Scheduling
 */
export function parseNaturalTime(input: string, now = new Date()): string | null {
  const s = input.trim().toLowerCase();

  // Arabic patterns
  const arHour = s.match(/بعد\s+(\d+)\s+ساعة/);
  if (arHour) return addHours(now, parseInt(arHour[1], 10)).toISOString();

  const arHours2 = s.match(/بعد\s+ساعتين/);
  if (arHours2) return addHours(now, 2).toISOString();

  const arHalf = s.match(/بعد\s+نصف\s+ساعة/);
  if (arHalf) return addMinutes(now, 30).toISOString();

  const arMin = s.match(/بعد\s+(\d+)\s+دقيقة/);
  if (arMin) return addMinutes(now, parseInt(arMin[1], 10)).toISOString();

  const arDay = s.match(/بعد\s+يوم|غداً|غدا/);
  if (arDay) return addHours(now, 24).toISOString();

  const arMorning = s.match(/الصبح|الصباح/);
  if (arMorning) return nextOccurrence(now, 8, 0).toISOString();

  const arNight = s.match(/الليل|منتصف الليل/);
  if (arNight) return nextOccurrence(now, 23, 0).toISOString();

  // English patterns
  const enHour = s.match(/in\s+(\d+)\s+hours?/);
  if (enHour) return addHours(now, parseInt(enHour[1], 10)).toISOString();

  const enMin = s.match(/in\s+(\d+)\s+min/);
  if (enMin) return addMinutes(now, parseInt(enMin[1], 10)).toISOString();

  const enTomorrow = s.match(/tomorrow/);
  if (enTomorrow) return addHours(now, 24).toISOString();

  // ISO passthrough
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s).toISOString();

  return null;
}

function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 3_600_000);
}

function addMinutes(d: Date, m: number): Date {
  return new Date(d.getTime() + m * 60_000);
}

function nextOccurrence(now: Date, hour: number, minute: number): Date {
  const t = new Date(now);
  t.setHours(hour, minute, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 1);
  return t;
}
