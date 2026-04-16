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
  // Manager — الراعي
  'الراعي': 'manager', "al-ra'i": 'manager', 'alrai': 'manager', 'al-rai': 'manager',

  // Architect — المصمم
  'المصمم': 'architect', 'al-musammim': 'architect', 'almusammim': 'architect',

  // Specialists (unchanged)
  'عبدان': 'research', 'abdan': 'research',
  'شواشة': 'reading-helper', 'shwasha': 'reading-helper',
  'الصفرا': 'writing-critic', 'al-safra': 'writing-critic', 'alsafra': 'writing-critic',
  'رمّانة': 'comparator', 'رمانة': 'comparator', 'rammana': 'comparator',
  'الدبسا': 'content-creator', 'al-dabsa': 'content-creator', 'aldabsa': 'content-creator',
  'الكرييتف': 'creative', 'creative': 'creative', 'alkreetif': 'creative',
  'مهام': 'tasks-agent', 'maham': 'tasks-agent', 'tasks': 'tasks-agent',
  'الفطين': 'fatin', 'fatin': 'fatin', 'alfatin': 'fatin', 'fateen': 'fatin',
  'المُمرر': 'playmaker', 'الممرر': 'playmaker', 'playmaker': 'playmaker',
  'clippy': 'clippy',

  // Legacy aliases for backward compatibility — الرحول used to be the
  // manager's label before the Week-1 rename. Keep routing to `manager`
  // for a transition period.
  'الرحول': 'manager',
  'ruhool': 'manager',
};
