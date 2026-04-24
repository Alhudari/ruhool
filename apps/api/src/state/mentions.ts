/**
 * Mention map: nickname (AR/EN) -> built-in agent id.
 * Extracted from index.ts (REL-01 stage 2d). Pure leaf constant.
 *
 * Canonical Week-1 rename:
 *   - Manager agent  = الراعي (Al-Ra'i)   → id `manager`
 *   - Architect agent = المصمم (Al-Musammim) → id `architect`
 *   - الرحول / Ruhool is the PLATFORM NAME only — kept as a legacy alias
 *     for the manager so old mentions keep routing correctly.
 */
export const MENTION_MAP: Record<string, string> = {
  // ── Canonical R12 Arabic names (primary aliases) ──────────────────
  'الراعي': 'manager', "al-ra'i": 'manager', 'alrai': 'manager', 'al-rai': 'manager',
  'الدكتور': 'doctor', 'al-duktor': 'doctor', 'doctor': 'doctor',
  'الباحث': 'research', 'al-bahith': 'research',
  'المُلخِّص': 'reading-helper', 'الملخص': 'reading-helper', 'al-mulakhkhis': 'reading-helper',
  'الناقد': 'writing-critic', 'al-naqid': 'writing-critic',
  'المُقارِن': 'comparator', 'المقارن': 'comparator', 'al-muqarin': 'comparator',
  'المصمم': 'architect', 'al-musammim': 'architect', 'almusammim': 'architect',
  'السارد': 'content-creator', 'al-sarid': 'content-creator',
  'المبدع': 'creative', "al-mubdi'": 'creative', 'al-mubdi': 'creative',
  'مهام': 'tasks-agent', 'maham': 'tasks-agent', 'tasks': 'tasks-agent',
  'المحلل': 'analyst', 'al-muhallil': 'analyst',
  'المنظّم': 'munazzim', 'المنظم': 'munazzim', 'al-munazzim': 'munazzim',
  'المشخّص': 'mushakhkhis', 'المشخص': 'mushakhkhis', 'al-mushakhkhis': 'mushakhkhis',
  'الخوي': 'research-companion', 'al-khuwy': 'research-companion', 'khuwy': 'research-companion',
  'الفطين': 'fatin', 'fatin': 'fatin', 'al-fatin': 'fatin',
  'المُمرر': 'playmaker', 'الممرر': 'playmaker', 'playmaker': 'playmaker', 'al-mumarrir': 'playmaker',
  'المُدوّن': 'mudawwin', 'المدون': 'mudawwin', 'mudawwin': 'mudawwin', 'al-mudawwin': 'mudawwin',
  'الكاتب': 'sayyaq', 'sayyaq': 'sayyaq', 'al-katib': 'sayyaq',
  'clippy': 'clippy',

  // ── Legacy camel-herd names — kept for backward compat ────────────
  'عبدان': 'research', 'abdan': 'research',
  'شواشة': 'reading-helper', 'shwasha': 'reading-helper',
  'الصفرا': 'writing-critic', 'al-safra': 'writing-critic', 'alsafra': 'writing-critic',
  'رمّانة': 'comparator', 'رمانة': 'comparator', 'rammana': 'comparator',
  'الدبسا': 'content-creator', 'al-dabsa': 'content-creator', 'aldabsa': 'content-creator',
  'الكرييتف': 'creative', 'alkreetif': 'creative',
  'رمّان': 'research-companion', 'ramman': 'research-companion',

  // ── Platform name alias ────────────────────────────────────────────
  'الرحول': 'manager',
  'ruhool': 'manager',
};
