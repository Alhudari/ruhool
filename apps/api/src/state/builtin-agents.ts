/**
 * Built-in agent registry. Extracted from index.ts (REL-01 stage 2d).
 * Pure leaf constant. Arabic identifiers preserved.
 *
 * Note: CAPABILITY_CHECKERS was NOT co-located here because it depends on
 * a number of local capability-check helper functions (checkMapbox,
 * checkMapTiler, ...) that still live in index.ts. That extraction is
 * deferred to a later stage.
 *
 * Round 4: agent display names migrated from the camel-herd motif to
 * trait-based Arabic names. IDs are stable — only `name.en` / `name.ar`
 * changed. Store data (conversations, audit, org JSON) is unaffected
 * because it references agents by `id`.
 */
export const BUILTIN_AGENTS = [
  { id: 'manager', moduleId: 'manager', name: { en: "Al-Ra'i", ar: 'الراعي' }, description: { en: "The PhD workspace CEO — routes to department managers", ar: 'مدير غرفة الدكتوراه — يوجّه مدراء الأقسام' }, icon: 'compass', color: 'amber', builtIn: true },
  { id: 'doctor', moduleId: 'doctor', name: { en: 'Al-Duktor', ar: 'الدكتور' }, description: { en: 'The Life workspace CEO — routes to productivity, finance, content departments', ar: 'مدير غرفة الحياة — يوجّه أقسام الإنتاجية والمالية والمحتوى' }, icon: 'briefcase', color: 'indigo', builtIn: true },
  { id: 'research', moduleId: 'research-agent', name: { en: 'Al-Bahith', ar: 'الباحث' }, description: { en: 'Deep research', ar: 'البحث العميق في الأوراق الأكاديمية' }, icon: 'search', color: 'purple', builtIn: true },
  { id: 'reading-helper', moduleId: 'reading-helper', name: { en: 'Al-Mulakhkhis', ar: 'المُلخِّص' }, description: { en: 'Guided paper reading + summarization', ar: 'قراءة موجهة للأوراق وتلخيصها' }, icon: 'book-open', color: 'blue', builtIn: true },
  { id: 'comparator', moduleId: 'comparator', name: { en: 'Al-Muqarin', ar: 'المُقارِن' }, description: { en: 'Compares papers', ar: 'يقارن بين الأوراق ويبرز الفروقات' }, icon: 'git-compare', color: 'rose', builtIn: true },
  { id: 'writing-critic', moduleId: 'writing-critic', name: { en: 'Al-Naqid', ar: 'الناقد' }, description: { en: 'Writing critic', ar: 'ناقد الكتابة الأكاديمية' }, icon: 'pen-tool', color: 'green', builtIn: true },
  { id: 'architect', moduleId: 'architect', name: { en: 'Al-Musammim', ar: 'المصمم' }, description: { en: 'Al-Musammim — designs and manages other agents', ar: 'المصمم — يصمم ويدير باقي الوكلاء' }, icon: 'crown', color: 'gold', builtIn: true },
  { id: 'content-creator', moduleId: 'content-creator', name: { en: 'Al-Sarid', ar: 'السارد' }, description: { en: 'Content storyteller — Arabic educational content', ar: 'السارد — يحكي المحتوى التعليمي بالعربية' }, icon: 'palette', color: 'pink', builtIn: true },
  { id: 'creative', moduleId: 'creative', name: { en: 'Al-Mubdi\'', ar: 'المبدع' }, description: { en: 'Video creator — Remotion expert, storyboards, reels', ar: 'صانع الفيديو — خبير Remotion، ستوريبورد، ريلز' }, icon: 'video', color: 'rose', builtIn: true },
  { id: 'tasks-agent', moduleId: 'tasks-agent', name: { en: 'Maham', ar: 'مهام' }, description: { en: 'Task manager — add, edit, organize your tasks', ar: 'مدير المهام — أضف وعدّل ونظّم مهامك' }, icon: 'check-square', color: 'emerald', builtIn: true },
  { id: 'analyst', moduleId: 'analyst', name: { en: 'Al-Muhallil', ar: 'المحلل' }, description: { en: 'Subscription & cost analyst — tracks usage, alerts on limits, advises optimization', ar: 'محلل الاشتراكات والتكاليف — يتابع الاستخدام، ينبّه عند الحدود، ويقترح التحسينات' }, icon: 'bar-chart-3', color: 'teal', builtIn: true },
  { id: 'munazzim', moduleId: 'munazzim', name: { en: 'Al-Munazzim', ar: 'المنظّم' }, description: { en: 'Conversation & project manager — archive, pin, organize, projects', ar: 'مدير المحادثات والمشاريع — أرشفة، تثبيت، تنظيم، إنشاء مشاريع' }, icon: 'folder-kanban', color: 'indigo', builtIn: true },
  { id: 'mushakhkhis', moduleId: 'mushakhkhis', name: { en: 'Al-Mushakhkhis', ar: 'المشخّص' }, description: { en: 'Diagnostician — tests all API keys, services, system health', ar: 'المشخّص — يفحص كل المفاتيح والخدمات وصحة النظام' }, icon: 'stethoscope', color: 'red', builtIn: true },
  { id: 'fatin', moduleId: 'fatin', name: { en: 'Al-Fatin', ar: 'الفطين' }, description: { en: 'Vision agent — understands handwritten notes, documents, receipts, photos, and routes them to the right agent', ar: 'الفطين — يفهم الأوراق المكتوبة بخط اليد، المستندات، الإيصالات، والصور، ويوجّهها للوكيل المناسب' }, icon: 'eye', color: 'cyan', builtIn: true },
  { id: 'playmaker', moduleId: 'playmaker', name: { en: 'Al-Mumarrir', ar: 'المُمرر' }, description: { en: 'Routing intelligence — reads each message to detect topic continuity, target agent(s), and reply context', ar: 'المُمرر — يقرأ كل رسالة ليكتشف استمرار الموضوع، الوكيل/الوكلاء المستهدفين، وسياق الرد' }, icon: 'shuffle', color: 'violet', builtIn: true },
  { id: 'clippy', moduleId: 'clippy', name: { en: 'Clippy', ar: 'Clippy' }, description: { en: 'Floating onboarding assistant — explains every page and feature with examples and illustrations', ar: 'المساعد العائم — يشرح كل صفحة وميزة بأمثلة ورسوم توضيحية' }, icon: 'help-circle', color: 'sky', builtIn: true },
  { id: 'research-companion', moduleId: 'research-companion', name: { en: 'Al-Khuwy', ar: 'الخوي' }, description: { en: 'PhD daily companion — your guide, idea partner, and research memory', ar: 'الخوي — دليلك اليومي وشريك أفكارك وذاكرة مسيرتك البحثية' }, icon: 'graduation-cap', color: 'emerald', builtIn: true },
  { id: 'mudawwin', moduleId: 'mudawwin', name: { en: 'Al-Mudawwin', ar: 'المُدوّن' }, description: { en: 'Meeting + supervision tracker — drafts meeting writeups, prepares for next meeting, knows all dates', ar: 'مُتابع الاجتماعات والإشراف — يصيغ توثيق الاجتماعات، يُجهّز للاجتماع القادم، يعرف كل التواريخ' }, icon: 'clipboard-list', color: 'amber', builtIn: true },
  { id: 'sayyaq', moduleId: 'sayyaq', name: { en: 'Al-Katib', ar: 'الكاتب' }, description: { en: 'Inline writing assistant — rewrite, organize, link, rename anywhere', ar: 'الكاتب — مساعد الصياغة الجواري: إعادة صياغة، تنظيم، ربط، تعديل عناوين في أي مكان' }, icon: 'pen-line', color: 'cyan', builtIn: true },
];
