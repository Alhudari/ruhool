/**
 * Mention map: nickname (AR/EN/legacy) → built-in agent id.
 *
 * Used by `services/chat/mention.ts` to resolve `@name` at the top of
 * the chat pipeline — before anything routes to the specialist
 * dispatcher. If a name isn't here, the user's `@mention` falls
 * through and the chat replies with the default CEO instead of the
 * intended agent. Keep this list exhaustive.
 *
 * Source-of-truth for specialist routing is
 * `services/agents/specialists.ts::SPECIALIST_ALIAS_MAP`. This file
 * intentionally duplicates + extends it because mention detection
 * also needs to cover CEOs (manager/doctor) and non-specialist
 * agents (clippy/playmaker) that never reach the dispatcher.
 */
export const MENTION_MAP: Record<string, string> = {
  // ─── CEOs ────────────────────────────────────────────────────────
  'الراعي': 'manager', "al-ra'i": 'manager', 'alrai': 'manager', 'al-rai': 'manager',
  'الدكتور': 'doctor', 'al-duktor': 'doctor', 'alduktor': 'doctor', 'doctor': 'doctor',
  // Legacy: "الرحول" was the manager's label before Week-1 rename.
  'الرحول': 'manager', 'ruhool': 'manager',

  // ─── Research department ────────────────────────────────────────
  'الباحث': 'research', 'al-bahith': 'research', 'albahith': 'research',
  'عبدان': 'research', 'abdan': 'research',                       // legacy
  'المُلخِّص': 'reading-helper', 'الملخص': 'reading-helper',
  'al-mulakhkhis': 'reading-helper', 'almulakhkhis': 'reading-helper',
  'شواشة': 'reading-helper', 'shwasha': 'reading-helper',          // legacy
  'المُقارِن': 'comparator', 'المقارن': 'comparator',
  'al-muqarin': 'comparator', 'almuqarin': 'comparator',
  'رمّانة': 'comparator', 'رمانة': 'comparator', 'rammana': 'comparator',  // legacy
  'الناقد': 'writing-critic', 'al-naqid': 'writing-critic', 'alnaqid': 'writing-critic',
  'الصفرا': 'writing-critic', 'al-safra': 'writing-critic', 'alsafra': 'writing-critic',  // legacy

  // ─── Writing / content ──────────────────────────────────────────
  'السارد': 'content-creator', 'al-sarid': 'content-creator', 'alsarid': 'content-creator',
  'الدبسا': 'content-creator', 'al-dabsa': 'content-creator', 'aldabsa': 'content-creator',  // legacy
  'المبدع': 'creative', 'al-mubdi': 'creative', "al-mubdi'": 'creative', 'almubdi': 'creative',
  'الكرييتف': 'creative', 'alkreetif': 'creative', 'creative': 'creative',  // legacy
  'الكاتب': 'sayyaq', 'al-katib': 'sayyaq', 'alkatib': 'sayyaq', 'sayyaq': 'sayyaq',
  'السياق': 'sayyaq',                                               // legacy
  'المُدوِّن': 'mudawwin', 'المُدوّن': 'mudawwin', 'المدون': 'mudawwin',
  'al-mudawwin': 'mudawwin', 'almudawwin': 'mudawwin', 'mudawwin': 'mudawwin',

  // ─── PhD daily companion ────────────────────────────────────────
  'الخوي': 'research-companion', 'al-khuwy': 'research-companion', 'alkhuwy': 'research-companion',
  'companion': 'research-companion', 'research-companion': 'research-companion',
  'رمّان': 'research-companion', 'رمان': 'research-companion',     // legacy
  'ramman': 'research-companion', 'rumman': 'research-companion',

  // ─── Architecture / ops ─────────────────────────────────────────
  'المصمم': 'architect', 'al-musammim': 'architect', 'almusammim': 'architect',
  'مهام': 'tasks-agent', 'maham': 'tasks-agent', 'tasks': 'tasks-agent',
  'المحلل': 'analyst', 'al-muhallil': 'analyst', 'almuhallil': 'analyst', 'muhallil': 'analyst',
  'المنظّم': 'munazzim', 'المنظم': 'munazzim',
  'al-munazzim': 'munazzim', 'almunazzim': 'munazzim', 'munazzim': 'munazzim',
  'المشخّص': 'mushakhkhis', 'المشخص': 'mushakhkhis',
  'al-mushakhkhis': 'mushakhkhis', 'almushakhkhis': 'mushakhkhis', 'mushakhkhis': 'mushakhkhis',

  // ─── Platform utilities ─────────────────────────────────────────
  'الفطين': 'fatin', 'fatin': 'fatin', 'alfatin': 'fatin', 'fateen': 'fatin', 'al-fatin': 'fatin',
  'المُمرر': 'playmaker', 'الممرر': 'playmaker', 'playmaker': 'playmaker', 'al-mumarrir': 'playmaker',
  'clippy': 'clippy',
};
