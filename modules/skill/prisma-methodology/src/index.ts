/**
 * PRISMA 2020 Systematic Review Methodology
 *
 * Based on: Page MJ, McKenzie JE, Bossuyt PM, et al.
 * The PRISMA 2020 statement: an updated guideline for reporting systematic reviews.
 * BMJ 2021;372:n71. doi: 10.1136/bmj.n71
 */

export interface PrismaChecklistItem {
  section: string;
  topic: string;
  item: number;
  description: { en: string; ar: string };
}

export const PRISMA_2020_CHECKLIST: PrismaChecklistItem[] = [
  // TITLE
  {
    section: 'Title',
    topic: 'Title',
    item: 1,
    description: {
      en: 'Identify the report as a systematic review.',
      ar: 'حدد التقرير كمراجعة منهجية.',
    },
  },
  // ABSTRACT
  {
    section: 'Abstract',
    topic: 'Abstract',
    item: 2,
    description: {
      en: 'Provide a structured summary including background, objectives, data sources, study eligibility criteria, participants, interventions, study appraisal and synthesis methods, results, limitations, conclusions, and registration number.',
      ar: 'قدم ملخصًا منظمًا يتضمن الخلفية، الأهداف، مصادر البيانات، معايير أهلية الدراسة، المشاركين، التدخلات، طرق التقييم والتوليف، النتائج، القيود، الاستنتاجات، ورقم التسجيل.',
    },
  },
  // INTRODUCTION
  {
    section: 'Introduction',
    topic: 'Rationale',
    item: 3,
    description: {
      en: 'Describe the rationale for the review in the context of existing knowledge.',
      ar: 'صف مبررات المراجعة في سياق المعرفة الحالية.',
    },
  },
  {
    section: 'Introduction',
    topic: 'Objectives',
    item: 4,
    description: {
      en: 'Provide an explicit statement of the objective(s) or question(s) the review addresses.',
      ar: 'قدم بيانًا صريحًا بالأهداف أو الأسئلة التي تعالجها المراجعة.',
    },
  },
  // METHODS
  {
    section: 'Methods',
    topic: 'Eligibility criteria',
    item: 5,
    description: {
      en: 'Specify the inclusion and exclusion criteria for the review and how studies were grouped for the syntheses.',
      ar: 'حدد معايير التضمين والاستبعاد للمراجعة وكيف تم تجميع الدراسات للتوليف.',
    },
  },
  {
    section: 'Methods',
    topic: 'Information sources',
    item: 6,
    description: {
      en: 'Specify all databases, registers, websites, organisations, reference lists and other sources searched or consulted to identify studies. Specify the date when each source was last searched or consulted.',
      ar: 'حدد جميع قواعد البيانات والسجلات والمواقع والمنظمات وقوائم المراجع والمصادر الأخرى. حدد تاريخ آخر بحث أو استشارة لكل مصدر.',
    },
  },
  {
    section: 'Methods',
    topic: 'Search strategy',
    item: 7,
    description: {
      en: 'Present the full search strategies for all databases, registers, and websites, including any filters and limits used.',
      ar: 'قدم استراتيجيات البحث الكاملة لجميع قواعد البيانات والسجلات والمواقع، بما في ذلك أي فلاتر وقيود مستخدمة.',
    },
  },
  {
    section: 'Methods',
    topic: 'Selection process',
    item: 8,
    description: {
      en: 'Specify the methods used to decide whether a study met the inclusion criteria, including how many reviewers screened each record and each full-text report, whether they worked independently, and any automation tools used.',
      ar: 'حدد الطرق المستخدمة لتحديد ما إذا كانت الدراسة تستوفي معايير التضمين، بما في ذلك عدد المراجعين وما إذا عملوا بشكل مستقل وأي أدوات آلية مستخدمة.',
    },
  },
  {
    section: 'Methods',
    topic: 'Data collection process',
    item: 9,
    description: {
      en: 'Specify the methods used to collect data from reports, including how many reviewers collected data, whether they worked independently, any processes for obtaining or confirming data, and any automation tools used.',
      ar: 'حدد الطرق المستخدمة لجمع البيانات من التقارير، بما في ذلك عدد المراجعين وأي عمليات للحصول على البيانات أو تأكيدها.',
    },
  },
  {
    section: 'Methods',
    topic: 'Data items',
    item: 10,
    description: {
      en: 'List and define all outcomes for which data were sought. List and define all other variables for which data were sought. Describe any assumptions made about any missing or unclear information.',
      ar: 'أدرج وعرّف جميع النتائج التي تم البحث عن بياناتها. صف أي افتراضات حول المعلومات المفقودة أو غير الواضحة.',
    },
  },
  {
    section: 'Methods',
    topic: 'Study risk of bias assessment',
    item: 11,
    description: {
      en: 'Specify the methods used to assess risk of bias in the included studies, including details of the tool(s) used, how many reviewers assessed each study, and whether they worked independently.',
      ar: 'حدد الطرق المستخدمة لتقييم خطر التحيز في الدراسات المشمولة.',
    },
  },
  {
    section: 'Methods',
    topic: 'Effect measures',
    item: 12,
    description: {
      en: 'Specify for each outcome the effect measure(s) (e.g., risk ratio, mean difference) used in the synthesis or presentation of results.',
      ar: 'حدد لكل نتيجة مقاييس التأثير المستخدمة في التوليف أو عرض النتائج.',
    },
  },
  {
    section: 'Methods',
    topic: 'Synthesis methods',
    item: 13,
    description: {
      en: 'Describe the processes used to decide which studies were eligible for each synthesis. Describe any methods used to tabulate or visually display results, methods used to synthesize results, and any sensitivity analyses conducted.',
      ar: 'صف العمليات المستخدمة لتحديد الدراسات المؤهلة لكل توليف. صف أي طرق لعرض النتائج وتحليلات الحساسية.',
    },
  },
  {
    section: 'Methods',
    topic: 'Reporting bias assessment',
    item: 14,
    description: {
      en: 'Describe any methods used to assess risk of bias due to missing results in a synthesis (arising from reporting biases).',
      ar: 'صف أي طرق مستخدمة لتقييم خطر التحيز بسبب النتائج المفقودة في التوليف.',
    },
  },
  {
    section: 'Methods',
    topic: 'Certainty assessment',
    item: 15,
    description: {
      en: 'Describe any methods used to assess certainty (or confidence) in the body of evidence for an outcome.',
      ar: 'صف أي طرق مستخدمة لتقييم اليقين (أو الثقة) في مجموعة الأدلة لنتيجة ما.',
    },
  },
  // RESULTS
  {
    section: 'Results',
    topic: 'Study selection',
    item: 16,
    description: {
      en: 'Describe the results of the search and selection process, from the number of records identified to the number included, ideally using a flow diagram.',
      ar: 'صف نتائج عملية البحث والاختيار، من عدد السجلات المحددة إلى العدد المشمول، باستخدام مخطط تدفق بشكل مثالي.',
    },
  },
  {
    section: 'Results',
    topic: 'Study characteristics',
    item: 17,
    description: {
      en: 'Cite each included study and present its characteristics.',
      ar: 'استشهد بكل دراسة مشمولة وقدم خصائصها.',
    },
  },
  {
    section: 'Results',
    topic: 'Risk of bias in studies',
    item: 18,
    description: {
      en: 'Present assessments of risk of bias for each included study.',
      ar: 'قدم تقييمات خطر التحيز لكل دراسة مشمولة.',
    },
  },
  {
    section: 'Results',
    topic: 'Results of individual studies',
    item: 19,
    description: {
      en: 'For all outcomes, present for each study: (a) summary statistics for each group and (b) an effect estimate and its precision.',
      ar: 'لجميع النتائج، قدم لكل دراسة: (أ) إحصاءات ملخصة لكل مجموعة و(ب) تقدير التأثير ودقته.',
    },
  },
  {
    section: 'Results',
    topic: 'Results of syntheses',
    item: 20,
    description: {
      en: 'For each synthesis, briefly summarise the characteristics and risk of bias among contributing studies. Present results of all statistical syntheses conducted, including results of any sensitivity analyses.',
      ar: 'لكل توليف، لخص بإيجاز خصائص وخطر التحيز بين الدراسات المساهمة. قدم نتائج جميع التوليفات الإحصائية.',
    },
  },
  {
    section: 'Results',
    topic: 'Reporting biases',
    item: 21,
    description: {
      en: 'Present assessments of risk of bias due to missing results for each synthesis assessed.',
      ar: 'قدم تقييمات خطر التحيز بسبب النتائج المفقودة لكل توليف تم تقييمه.',
    },
  },
  {
    section: 'Results',
    topic: 'Certainty of evidence',
    item: 22,
    description: {
      en: 'Present assessments of certainty (or confidence) in the body of evidence for each outcome assessed.',
      ar: 'قدم تقييمات اليقين (أو الثقة) في مجموعة الأدلة لكل نتيجة تم تقييمها.',
    },
  },
  // DISCUSSION
  {
    section: 'Discussion',
    topic: 'Discussion',
    item: 23,
    description: {
      en: 'Provide a general interpretation of the results in the context of other evidence. Discuss limitations of the evidence and of the review process. Discuss implications of the results for practice, policy, and future research.',
      ar: 'قدم تفسيرًا عامًا للنتائج في سياق الأدلة الأخرى. ناقش قيود الأدلة وعملية المراجعة. ناقش تأثيرات النتائج على الممارسة والسياسة والبحث المستقبلي.',
    },
  },
  // OTHER INFORMATION
  {
    section: 'Other Information',
    topic: 'Registration and protocol',
    item: 24,
    description: {
      en: 'Provide registration information for the review, including register name and registration number, or state that the review was not registered. Indicate where the review protocol can be accessed.',
      ar: 'قدم معلومات التسجيل للمراجعة، بما في ذلك اسم السجل ورقم التسجيل، أو أشر إلى أن المراجعة لم تُسجل.',
    },
  },
  {
    section: 'Other Information',
    topic: 'Support',
    item: 25,
    description: {
      en: 'Describe sources of financial or non-financial support for the review, and the role of the funders or sponsors in the review.',
      ar: 'صف مصادر الدعم المالي أو غير المالي للمراجعة، ودور الممولين أو الرعاة في المراجعة.',
    },
  },
  {
    section: 'Other Information',
    topic: 'Competing interests',
    item: 26,
    description: {
      en: 'Declare any competing interests of review authors.',
      ar: 'أعلن عن أي تضارب مصالح لمؤلفي المراجعة.',
    },
  },
  {
    section: 'Other Information',
    topic: 'Availability of data, code, and other materials',
    item: 27,
    description: {
      en: 'Report which of the following are publicly available and where they can be found: template data collection forms, data extracted from included studies, data used for analyses, analytic code, any other materials used in the review.',
      ar: 'أبلغ عن أي من المواد التالية متاحة للعامة وأين يمكن العثور عليها: نماذج جمع البيانات، البيانات المستخرجة، بيانات التحليل، رمز التحليل، وأي مواد أخرى.',
    },
  },
];

/**
 * PRISMA 2020 Flow Diagram phases
 */
export const PRISMA_FLOW_PHASES = {
  identification: {
    en: 'Identification',
    ar: 'التعريف',
    description: {
      en: 'Records identified through database searching and other sources.',
      ar: 'السجلات المحددة من خلال البحث في قواعد البيانات ومصادر أخرى.',
    },
  },
  screening: {
    en: 'Screening',
    ar: 'الفرز',
    description: {
      en: 'Records screened after duplicates removed, with reasons for exclusion.',
      ar: 'السجلات التي تم فرزها بعد إزالة التكرارات، مع أسباب الاستبعاد.',
    },
  },
  eligibility: {
    en: 'Eligibility',
    ar: 'الأهلية',
    description: {
      en: 'Full-text articles assessed for eligibility.',
      ar: 'المقالات الكاملة التي تم تقييم أهليتها.',
    },
  },
  included: {
    en: 'Included',
    ar: 'المشمولة',
    description: {
      en: 'Studies included in qualitative and/or quantitative synthesis.',
      ar: 'الدراسات المشمولة في التوليف النوعي و/أو الكمي.',
    },
  },
} as const;

/**
 * PRISMA methodology knowledge — key principles
 */
export const PRISMA_METHODOLOGY = {
  name: { en: 'PRISMA 2020', ar: 'بريزما 2020' },
  fullName: {
    en: 'Preferred Reporting Items for Systematic Reviews and Meta-Analyses',
    ar: 'العناصر المفضلة للإبلاغ عن المراجعات المنهجية والتحليلات الوصفية',
  },
  citation:
    'Page MJ, McKenzie JE, Bossuyt PM, et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. BMJ 2021;372:n71.',
  totalItems: 27,
  sections: ['Title', 'Abstract', 'Introduction', 'Methods', 'Results', 'Discussion', 'Other Information'],
  checklist: PRISMA_2020_CHECKLIST,
  flowPhases: PRISMA_FLOW_PHASES,
} as const;
