/**
 * Built-in agent registry. Extracted from index.ts (REL-01 stage 2d).
 * Pure leaf constant. Arabic identifiers preserved.
 *
 * Note: CAPABILITY_CHECKERS was NOT co-located here because it depends on
 * a number of local capability-check helper functions (checkMapbox,
 * checkMapTiler, ...) that still live in index.ts. That extraction is
 * deferred to a later stage.
 */
export const BUILTIN_AGENTS = [
  { id: 'manager', moduleId: 'manager', name: { en: 'Al-Ra\'i (الراعي)', ar: 'الراعي' }, description: { en: 'The Shepherd — leads the herd, orchestrates agents', ar: 'الراعي — يقود الذود ويوجه الوكلاء' }, icon: 'compass', color: 'amber', builtIn: true },
  { id: 'research', moduleId: 'research-agent', name: { en: 'Abdan', ar: 'عبدان' }, description: { en: 'Deep research', ar: 'بحث عميق' }, icon: 'search', color: 'purple', builtIn: true },
  { id: 'reading-helper', moduleId: 'reading-helper', name: { en: 'Shwasha', ar: 'شواشة' }, description: { en: 'Guided paper reading', ar: 'قراءة موجهة للأوراق' }, icon: 'book-open', color: 'blue', builtIn: true },
  { id: 'comparator', moduleId: 'comparator', name: { en: 'Rammana', ar: 'رمّانة' }, description: { en: 'Compares papers', ar: 'تقارن بين الأوراق' }, icon: 'git-compare', color: 'rose', builtIn: true },
  { id: 'writing-critic', moduleId: 'writing-critic', name: { en: 'Al-Safra', ar: 'الصفرا' }, description: { en: 'Writing critic', ar: 'ناقدة الكتابة' }, icon: 'pen-tool', color: 'green', builtIn: true },
  { id: 'architect', moduleId: 'architect', name: { en: 'Al-Musammim', ar: 'المصمم' }, description: { en: 'Al-Musammim — designs and manages other agents', ar: 'المصمم — يصمم ويدير باقي الوكلاء' }, icon: 'crown', color: 'gold', builtIn: true },
  { id: 'content-creator', moduleId: 'content-creator', name: { en: 'Al-Dabsa (الدبسا)', ar: 'الدبسا' }, description: { en: 'Content creator — Arabic educational content', ar: 'صانعة المحتوى — محتوى تعليمي عربي' }, icon: 'palette', color: 'pink', builtIn: true },
  { id: 'creative', moduleId: 'creative', name: { en: 'The Creative (\u0627\u0644\u0643\u0631\u064a\u064a\u062a\u0641)', ar: '\u0627\u0644\u0643\u0631\u064a\u064a\u062a\u0641' }, description: { en: 'Video creator \u2014 Remotion expert, storyboards, reels', ar: '\u0635\u0627\u0646\u0639 \u0627\u0644\u0641\u064a\u062f\u064a\u0648 \u2014 \u062e\u0628\u064a\u0631 Remotion\u060c \u0633\u062a\u0648\u0631\u064a \u0628\u0648\u0631\u062f\u060c \u0631\u064a\u0644\u0632' }, icon: 'video', color: 'rose', builtIn: true },
  { id: 'tasks-agent', moduleId: 'tasks-agent', name: { en: 'Maham (\u0645\u0647\u0627\u0645)', ar: '\u0645\u0647\u0627\u0645' }, description: { en: 'Task manager \u2014 add, edit, organize your tasks', ar: '\u0645\u062f\u064a\u0631 \u0627\u0644\u0645\u0647\u0627\u0645 \u2014 \u0623\u0636\u0641 \u0648\u0639\u062f\u0651\u0644 \u0648\u0646\u0638\u0651\u0645 \u0645\u0647\u0627\u0645\u0643' }, icon: 'check-square', color: 'emerald', builtIn: true },
  { id: 'analyst', moduleId: 'analyst', name: { en: 'Al-Muhallil', ar: 'المحلل' }, description: { en: 'Subscription & cost analyst — tracks usage, alerts on limits, advises optimization', ar: 'محلل الاشتراكات والتكاليف — يتابع الاستخدام، ينبّه عند الحدود، ويقترح التحسينات' }, icon: 'bar-chart-3', color: 'teal', builtIn: true },
  { id: 'munazzim', moduleId: 'munazzim', name: { en: 'Al-Munazzim', ar: 'المنظّم' }, description: { en: 'Conversation & project manager — archive, pin, organize, projects', ar: 'مدير المحادثات والمشاريع — أرشفة، تثبيت، تنظيم، إنشاء مشاريع' }, icon: 'folder-kanban', color: 'indigo', builtIn: true },
  { id: 'mushakhkhis', moduleId: 'mushakhkhis', name: { en: 'Al-Mushakhkhis', ar: 'المشخّص' }, description: { en: 'Diagnostician — tests all API keys, services, system health', ar: 'المشخّص — يفحص كل المفاتيح والخدمات وصحة النظام' }, icon: 'stethoscope', color: 'red', builtIn: true },
  { id: 'fatin', moduleId: 'fatin', name: { en: 'Al-Fatin', ar: 'الفطين' }, description: { en: 'Vision agent — understands handwritten notes, documents, receipts, photos, and routes them to the right agent', ar: 'الفطين — يفهم الأوراق المكتوبة بخط اليد، المستندات، الإيصالات، والصور، ويوجّهها للوكيل المناسب' }, icon: 'eye', color: 'cyan', builtIn: true },
  { id: 'playmaker', moduleId: 'playmaker', name: { en: 'Al-Mumarrir (Play Maker)', ar: 'المُمرر' }, description: { en: 'Routing intelligence — reads each message to detect topic continuity, target agent(s), and reply context', ar: 'المُمرر — يقرأ كل رسالة ليكتشف استمرار الموضوع، الوكيل/الوكلاء المستهدفين، وسياق الرد' }, icon: 'shuffle', color: 'violet', builtIn: true },
  { id: 'clippy', moduleId: 'clippy', name: { en: 'Clippy', ar: 'Clippy' }, description: { en: 'Floating onboarding assistant — explains every page and feature with examples and illustrations', ar: 'المساعد العائم — يشرح كل صفحة وميزة بأمثلة ورسوم توضيحية' }, icon: 'help-circle', color: 'sky', builtIn: true },
];
