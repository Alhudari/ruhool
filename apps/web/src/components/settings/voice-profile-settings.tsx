'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Mic2, Sparkles } from 'lucide-react';
import { useAppStore } from '@/store/app';
import { apiFetch } from '@/lib/api';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { SaveBar, useSaveBarHeight } from '@/components/settings/save-bar';

interface VoiceProfile {
  content: string;
  updatedAt: string;
}

const SUGGESTED_TEMPLATE_AR = `# عن نفسي
اكتب هنا: مين أنت، خلفيتك، تخصصك، هويتك المهنية بشكل عام.

# اسلوبي بالكتابة
- نبرة عامة (رسمية / غير رسمية / خليط)
- لغة مفضلة بكل سياق (عربي/انجليزي)
- جمل طويلة أو قصيرة؟ مباشر أو وصفي؟
- كلمات وعبارات أستخدمها كثير

# اخطائي الإملائية والنحوية الشائعة
اذكرها صراحة كي يعرف الوكيل مستواك الفعلي ولا "يصحّح" تلقائي:
- مثلاً: "لذى" بدل "لذا"
- مثلاً: همزات وصل/قطع
- اي اخطاء في انجليزي

# مواضيع البحث اللي اكتب فيها كثير
اطلق العنان: اكتب فقرة طويلة عن البحث، الأسئلة اللي تشغل بالك، الافكار النصف-جاهزة، التحفظات على ادبيات معينة، ملاحظاتك من السوق الكويتي/الخليجي…

# طريقة كتابة الملاحظات
- نقاط أم فقرات؟
- استخدم عناوين فرعية ولا لا؟
- أرفق روابط/استشهادات وقت ما يكون عندي؟

# قوالب جملي المفضلة
- اقتباسات من اشخاص تأثرت فيهم
- صياغات جاهزة تستخدمها كثير
`;

const SUGGESTED_TEMPLATE_EN = `# About me
Write here: who you are, your background, your professional identity.

# My writing style
- Overall tone (formal / casual / mixed)
- Preferred language per context (Arabic / English)
- Long or short sentences? Direct or descriptive?
- Words and phrases I overuse

# My common spelling/grammar quirks
Be explicit so the agent learns your real level and does NOT silently "fix" them:
- e.g. "teh" → "the" (and which mistakes you DO want kept)
- punctuation habits
- mixed-script habits (English inside Arabic etc.)

# Research topics I write about a lot
Free-write: long paragraph about your research, the questions on your mind, half-baked ideas, reservations about specific literature, observations from the Kuwait/GCC market…

# How I take notes
- Bullets or paragraphs?
- Subheadings yes/no?
- Inline citations?

# Phrases I love
- Quotes from people who influenced you
- Stock framings you reuse
`;

export function VoiceProfileSettings() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [initial, setInitial] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await apiFetch<VoiceProfile>('/api/settings/voice-profile');
        if (cancelled) return;
        setInitial(data.content || '');
        setContent(data.content || '');
        setUpdatedAt(data.updatedAt || '');
      } catch (e) {
        if (!cancelled) setErrorMessage(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = content !== initial;
  useUnsavedChanges(dirty);
  const saveBarPad = useSaveBarHeight(dirty || !!successMessage);
  const suggested = isRTL ? SUGGESTED_TEMPLATE_AR : SUGGESTED_TEMPLATE_EN;
  const wordCount = useMemo(
    () => (content.trim() ? content.trim().split(/\s+/).length : 0),
    [content]
  );
  const charCount = content.length;

  const onSave = async () => {
    setSaving(true);
    setErrorMessage(null);
    try {
      const data = await apiFetch<VoiceProfile>('/api/settings/voice-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      setInitial(data.content);
      setUpdatedAt(data.updatedAt);
      setSuccessMessage(isRTL ? 'حُفظ' : 'Saved');
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : (isRTL ? 'فشل الحفظ' : 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setContent(initial);
    setErrorMessage(null);
  };

  const onLoadTemplate = () => {
    if (content.trim() && !confirm(isRTL ? 'استبدال المحتوى الحالي بالقالب المقترح؟' : 'Replace current content with the suggested template?')) {
      return;
    }
    setContent(suggested);
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-accent/10 p-2 text-accent">
          <Mic2 className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">
            {isRTL ? 'اسلوبي بالكتابة' : 'My Writing Voice'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isRTL
              ? 'وصف طويل وحر لاسلوبك. كل وكيل في رحول يكتب نيابة عنك يقرأ هذا الملف ويحاول يقلّد لهجتك ومستواك الفعلي. اشمل اخطاءك الاملائية والنحوية لو حاب الوكيل ما يصحّحها تلقائياً.'
              : 'Long-form, free description of how you write. Every Ruhool agent that writes on your behalf reads this and tries to mimic your tone and actual level. Include the spelling/grammar quirks you want preserved.'}
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{isRTL ? `الكلمات: ${wordCount}` : `Words: ${wordCount}`}</span>
            <span>·</span>
            <span>{isRTL ? `الحروف: ${charCount.toLocaleString()}` : `Chars: ${charCount.toLocaleString()}`}</span>
            {updatedAt && (
              <>
                <span>·</span>
                <span>
                  {isRTL ? 'آخر حفظ: ' : 'Saved: '}
                  {new Date(updatedAt).toLocaleString(isRTL ? 'ar' : 'en')}
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onLoadTemplate}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
            title={isRTL ? 'تحميل قالب يقترح اقسام لتعبّيها' : 'Load a template with suggested sections to fill in'}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {isRTL ? 'قالب مقترح' : 'Suggested template'}
          </button>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={loading}
          dir="auto"
          spellCheck={false}
          placeholder={
            isRTL
              ? 'اكتب هنا بدون قيود… كل اللي يطري في بالك عن البحث، اسلوبك، اخطاءك، عبارات تستخدمها…'
              : 'Write freely… everything on your mind about your research, style, quirks, signature phrases…'
          }
          className="block min-h-[480px] w-full resize-y rounded-b-lg bg-transparent p-4 font-mono text-sm leading-relaxed outline-none focus:bg-background"
        />
      </div>

      <div style={{ height: saveBarPad }} aria-hidden="true" />
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={onSave}
        onDiscard={discard}
        successMessage={successMessage}
        errorMessage={errorMessage}
      />
    </div>
  );
}
