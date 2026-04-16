export type ContentType = 'carousel' | 'reels' | 'thread' | 'ideas';

export interface CarouselParams {
  topic: string;
  audience: 'engineers' | 'students' | 'general';
  slideCount: number;
}

export interface ReelsParams {
  topic: string;
  duration: '30s' | '45s' | '60s';
  style: 'educational' | 'storytelling' | 'tips';
}

export interface ThreadParams {
  topic: string;
  tweetCount: number;
}

export interface IdeasParams {
  month: string;
  niche: 'bim' | 'engineering' | 'technology' | 'career';
}

const AUDIENCE_MAP = {
  engineers: 'مهندسون محترفون',
  students: 'طلاب هندسة',
  general: 'جمهور عام مهتم بالتكنولوجيا',
};

const STYLE_MAP = {
  educational: 'تعليمي — شرح خطوة بخطوة',
  storytelling: 'قصصي — حكاية واقعية أو تجربة',
  tips: 'نصائح — قائمة نصائح سريعة',
};

const DURATION_MAP = {
  '30s': '30 ثانية',
  '45s': '45 ثانية',
  '60s': '60 ثانية',
};

const NICHE_MAP = {
  bim: 'نمذجة معلومات البناء (BIM)',
  engineering: 'الهندسة المدنية والمعمارية',
  technology: 'التكنولوجيا والذكاء الاصطناعي',
  career: 'المسيرة المهنية للمهندسين',
};

const MONTH_NAMES_AR: Record<string, string> = {
  '01': 'يناير', '02': 'فبراير', '03': 'مارس', '04': 'أبريل',
  '05': 'مايو', '06': 'يونيو', '07': 'يوليو', '08': 'أغسطس',
  '09': 'سبتمبر', '10': 'أكتوبر', '11': 'نوفمبر', '12': 'ديسمبر',
};

export function buildCarouselPrompt(params: CarouselParams): string {
  return `اكتب كاروسيل إنستغرام تعليمي عن: "${params.topic}"

الجمهور المستهدف: ${AUDIENCE_MAP[params.audience]}
عدد الشرائح: ${params.slideCount}

اكتب كل شريحة برقمها وعنوانها ومحتواها. ابدأ بشريحة غلاف جذابة واختم بشريحة CTA.
اجعل كل شريحة مختصرة (جملتان كحد أقصى). استخدم أرقاماً وإحصائيات حقيقية.`;
}

export function buildReelsPrompt(params: ReelsParams): string {
  return `اكتب سكريبت ريلز عن: "${params.topic}"

المدة: ${DURATION_MAP[params.duration]}
الأسلوب: ${STYLE_MAP[params.style]}

اكتب السكريبت بالتنسيق التالي:
- Hook (أول 3 ثوان): سؤال صادم أو إحصائية
- المحتوى: شرح مبسط بخطوات مع [ملاحظات التصوير] بين أقواس مربعة
- CTA (آخر 5 ثوان): دعوة للتفاعل

أضف توقيتات تقريبية لكل جزء.`;
}

export function buildThreadPrompt(params: ThreadParams): string {
  return `اكتب ثريد تويتر عن: "${params.topic}"

عدد التغريدات: ${params.tweetCount}

التنسيق:
- تغريدة 1: Hook + وعد بالقيمة
- تغريدات 2-${params.tweetCount - 1}: نقطة لكل تغريدة (280 حرف كحد أقصى لكل تغريدة)
- تغريدة ${params.tweetCount}: خلاصة + CTA + "أعد التغريد لتعم الفائدة"

اكتب عدد الأحرف بجانب كل تغريدة.`;
}

export function buildIdeasPrompt(params: IdeasParams): string {
  const monthKey = params.month.split('-')[1] || '01';
  const monthName = MONTH_NAMES_AR[monthKey] || params.month;

  return `اقترح خطة محتوى لشهر ${monthName} في مجال: ${NICHE_MAP[params.niche]}

اكتب جدول محتوى لـ 4 أسابيع، كل أسبوع يحتوي 3-4 أفكار محتوى.

لكل فكرة اذكر:
- نوع المحتوى (كاروسيل / ريلز / ثريد / بوست)
- الموضوع
- الخطاف المقترح (جملة واحدة)

راعِ التنوع بين أنواع المحتوى والمواضيع.`;
}
