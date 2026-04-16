'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Palette,
  Image,
  Film,
  MessageCircle,
  Lightbulb,
  Loader2,
  Copy,
  Download,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiStream } from '@/lib/api';
import {
  buildCarouselPrompt,
  buildReelsPrompt,
  buildThreadPrompt,
  buildIdeasPrompt,
  type CarouselParams,
  type ReelsParams,
  type ThreadParams,
  type IdeasParams,
} from './content-templates';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Tab = 'carousel' | 'reels' | 'thread' | 'ideas';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TABS: { id: Tab; icon: React.ComponentType<any>; label: { en: string; ar: string } }[] = [
  { id: 'carousel', icon: Image, label: { en: 'Carousel', ar: 'كاروسيل' } },
  { id: 'reels', icon: Film, label: { en: 'Reels', ar: 'ريلز' } },
  { id: 'thread', icon: MessageCircle, label: { en: 'Thread', ar: 'ثريد' } },
  { id: 'ideas', icon: Lightbulb, label: { en: 'Ideas', ar: 'أفكار' } },
];

export function ContentPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [activeTab, setActiveTab] = useState<Tab>('carousel');
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  // Carousel state
  const [carouselTopic, setCarouselTopic] = useState('');
  const [carouselAudience, setCarouselAudience] = useState<'engineers' | 'students' | 'general'>('engineers');
  const [carouselSlides, setCarouselSlides] = useState(8);

  // Reels state
  const [reelsTopic, setReelsTopic] = useState('');
  const [reelsDuration, setReelsDuration] = useState<'30s' | '45s' | '60s'>('30s');
  const [reelsStyle, setReelsStyle] = useState<'educational' | 'storytelling' | 'tips'>('educational');

  // Thread state
  const [threadTopic, setThreadTopic] = useState('');
  const [threadCount, setThreadCount] = useState(6);

  // Ideas state
  const [ideasMonth, setIdeasMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [ideasNiche, setIdeasNiche] = useState<'bim' | 'engineering' | 'technology' | 'career'>('bim');

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const generate = () => {
    let prompt = '';
    switch (activeTab) {
      case 'carousel':
        if (!carouselTopic.trim()) return;
        prompt = buildCarouselPrompt({ topic: carouselTopic, audience: carouselAudience, slideCount: carouselSlides } as CarouselParams);
        break;
      case 'reels':
        if (!reelsTopic.trim()) return;
        prompt = buildReelsPrompt({ topic: reelsTopic, duration: reelsDuration, style: reelsStyle } as ReelsParams);
        break;
      case 'thread':
        if (!threadTopic.trim()) return;
        prompt = buildThreadPrompt({ topic: threadTopic, tweetCount: threadCount } as ThreadParams);
        break;
      case 'ideas':
        prompt = buildIdeasPrompt({ month: ideasMonth, niche: ideasNiche } as IdeasParams);
        break;
    }

    setLoading(true);
    setOutput('');

    apiStream(
      '/api/chat',
      { message: prompt, agentId: 'content-creator', language: 'ar' },
      (event, data) => {
        if (event === 'token') {
          const d = data as { token: string };
          setOutput((prev) => prev + d.token);
        }
      },
      () => setLoading(false),
      (err) => {
        setOutput((prev) => prev + '\n\n[خطأ: ' + err + ']');
        setLoading(false);
      }
    );
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputLabel = (en: string, ar: string) => (
    <label className="block text-sm font-medium text-on-surface mb-1.5">
      {isRTL ? ar : en}
    </label>
  );

  const selectClass = 'w-full px-3 py-2 rounded-[var(--radius)] border border-border bg-input text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-ring';
  const inputClass = selectClass;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <div className="p-2 rounded-[var(--radius)] bg-pink-500/10 text-pink-600 dark:text-pink-400">
          <Palette size={20} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-on-surface">
            {isRTL ? 'الدبسا — صناعة المحتوى' : 'Al-Dabsa — Content Creator'}
          </h1>
          <p className="text-xs text-on-surface-tertiary">
            {isRTL ? 'محتوى تعليمي عربي للسوشال ميديا' : 'Arabic educational social media content'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 py-3 border-b border-border overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setOutput(''); }}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm font-medium transition-colors whitespace-nowrap',
              activeTab === tab.id
                ? 'bg-pink-500/10 text-pink-600 dark:text-pink-400'
                : 'text-on-surface-secondary hover:bg-surface-secondary'
            )}
          >
            <tab.icon size={16} />
            {tab.label[language]}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <div className="space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>
            {activeTab === 'carousel' && (
              <>
                {inputLabel('Topic', 'الموضوع')}
                <input
                  type="text"
                  value={carouselTopic}
                  onChange={(e) => setCarouselTopic(e.target.value)}
                  placeholder={isRTL ? 'مثال: مقدمة في BIM للمهندسين' : 'e.g. Introduction to BIM for engineers'}
                  className={inputClass}
                  dir={isRTL ? 'rtl' : 'ltr'}
                />

                {inputLabel('Target Audience', 'الجمهور المستهدف')}
                <select value={carouselAudience} onChange={(e) => setCarouselAudience(e.target.value as CarouselParams['audience'])} className={selectClass}>
                  <option value="engineers">{isRTL ? 'مهندسون محترفون' : 'Professional Engineers'}</option>
                  <option value="students">{isRTL ? 'طلاب هندسة' : 'Engineering Students'}</option>
                  <option value="general">{isRTL ? 'جمهور عام' : 'General Audience'}</option>
                </select>

                {inputLabel('Number of Slides', 'عدد الشرائح')}
                <div className="flex items-center gap-3">
                  {[6, 7, 8, 9, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => setCarouselSlides(n)}
                      className={cn(
                        'w-10 h-10 rounded-[var(--radius)] text-sm font-medium transition-colors',
                        carouselSlides === n
                          ? 'bg-pink-500/20 text-pink-600 dark:text-pink-400 border border-pink-500/30'
                          : 'bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary'
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </>
            )}

            {activeTab === 'reels' && (
              <>
                {inputLabel('Topic', 'الموضوع')}
                <input
                  type="text"
                  value={reelsTopic}
                  onChange={(e) => setReelsTopic(e.target.value)}
                  placeholder={isRTL ? 'مثال: 5 أخطاء شائعة في تنسيق BIM' : 'e.g. 5 common BIM coordination mistakes'}
                  className={inputClass}
                  dir={isRTL ? 'rtl' : 'ltr'}
                />

                {inputLabel('Duration', 'المدة')}
                <div className="flex items-center gap-3">
                  {(['30s', '45s', '60s'] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setReelsDuration(d)}
                      className={cn(
                        'px-4 py-2 rounded-[var(--radius)] text-sm font-medium transition-colors',
                        reelsDuration === d
                          ? 'bg-pink-500/20 text-pink-600 dark:text-pink-400 border border-pink-500/30'
                          : 'bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary'
                      )}
                    >
                      {d === '30s' ? '30s' : d === '45s' ? '45s' : '60s'}
                    </button>
                  ))}
                </div>

                {inputLabel('Style', 'الأسلوب')}
                <select value={reelsStyle} onChange={(e) => setReelsStyle(e.target.value as ReelsParams['style'])} className={selectClass}>
                  <option value="educational">{isRTL ? 'تعليمي' : 'Educational'}</option>
                  <option value="storytelling">{isRTL ? 'قصصي' : 'Storytelling'}</option>
                  <option value="tips">{isRTL ? 'نصائح سريعة' : 'Quick Tips'}</option>
                </select>
              </>
            )}

            {activeTab === 'thread' && (
              <>
                {inputLabel('Topic', 'الموضوع')}
                <input
                  type="text"
                  value={threadTopic}
                  onChange={(e) => setThreadTopic(e.target.value)}
                  placeholder={isRTL ? 'مثال: لماذا BIM هو مستقبل البناء؟' : 'e.g. Why BIM is the future of construction?'}
                  className={inputClass}
                  dir={isRTL ? 'rtl' : 'ltr'}
                />

                {inputLabel('Number of Tweets', 'عدد التغريدات')}
                <div className="flex items-center gap-3">
                  {[5, 6, 7, 8].map((n) => (
                    <button
                      key={n}
                      onClick={() => setThreadCount(n)}
                      className={cn(
                        'w-10 h-10 rounded-[var(--radius)] text-sm font-medium transition-colors',
                        threadCount === n
                          ? 'bg-pink-500/20 text-pink-600 dark:text-pink-400 border border-pink-500/30'
                          : 'bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary'
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </>
            )}

            {activeTab === 'ideas' && (
              <>
                {inputLabel('Month', 'الشهر')}
                <input
                  type="month"
                  value={ideasMonth}
                  onChange={(e) => setIdeasMonth(e.target.value)}
                  className={inputClass}
                />

                {inputLabel('Niche', 'المجال')}
                <select value={ideasNiche} onChange={(e) => setIdeasNiche(e.target.value as IdeasParams['niche'])} className={selectClass}>
                  <option value="bim">{isRTL ? 'نمذجة معلومات البناء (BIM)' : 'BIM'}</option>
                  <option value="engineering">{isRTL ? 'الهندسة المدنية والمعمارية' : 'Civil & Architectural Engineering'}</option>
                  <option value="technology">{isRTL ? 'التكنولوجيا والذكاء الاصطناعي' : 'Technology & AI'}</option>
                  <option value="career">{isRTL ? 'المسيرة المهنية' : 'Engineering Career'}</option>
                </select>
              </>
            )}

            {/* Generate Button */}
            <button
              onClick={generate}
              disabled={loading}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--radius)] text-sm font-medium transition-colors mt-4',
                'bg-pink-600 text-white hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {isRTL ? 'جاري التوليد...' : 'Generating...'}
                </>
              ) : (
                isRTL ? 'توليد المحتوى' : 'Generate Content'
              )}
            </button>
          </div>

          {/* Output */}
          <div className="flex flex-col min-h-[300px]">
            {output ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius)] text-xs font-medium bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary transition-colors"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? (isRTL ? 'تم النسخ' : 'Copied') : (isRTL ? 'نسخ الكل' : 'Copy All')}
                  </button>
                  <button
                    onClick={handleExport}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius)] text-xs font-medium bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary transition-colors"
                  >
                    <Download size={14} />
                    {isRTL ? 'تصدير نص' : 'Export as Text'}
                  </button>
                </div>
                <div
                  ref={outputRef}
                  dir="rtl"
                  className="flex-1 overflow-auto p-4 rounded-[var(--radius-lg)] border border-border bg-surface-secondary text-on-surface text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none"
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
                  {loading && <span className="inline-block w-2 h-4 bg-pink-500 animate-pulse ml-0.5" />}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border">
                <div className="text-center text-on-surface-tertiary">
                  <Palette size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">
                    {isRTL ? 'المحتوى سيظهر هنا' : 'Content will appear here'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
