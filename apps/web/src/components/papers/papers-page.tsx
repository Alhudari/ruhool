'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, FileText, BookOpen, Loader2, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';
import { apiFetch, API_BASE_URL } from '@/lib/api';
import { ItemMenu, ShowArchivedToggle } from '@/components/ui/item-menu';

interface Paper {
  id: string;
  filename: string;
  title: string;
  authors: string;
  pages: number;
  textLength: number;
  sections: { title: string; content: string }[];
  archived?: boolean;
  createdAt: string;
}

interface Note {
  id: string;
  paperId: string;
  section: string;
  type: string;
  content: string;
  themes: string[];
  createdAt: string;
}

export function PapersPage() {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [papers, setPapers] = useState<Paper[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const CATEGORIES = [
    { id: 'all', label: isRTL ? 'الكل' : 'All' },
    { id: 'papers', label: isRTL ? 'أوراق بحثية' : 'Papers' },
    { id: 'reports', label: isRTL ? 'تقارير' : 'Reports' },
    { id: 'standards', label: isRTL ? 'معايير' : 'Standards' },
  ];

  const load = async () => {
    try {
      const [p, n] = await Promise.all([
        apiFetch<Paper[]>(`/api/papers?archived=${showArchived}`),
        apiFetch<Note[]>('/api/notes'),
      ]);
      setPapers(p);
      setNotes(n);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [showArchived]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE_URL}/api/papers`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) await load();
    } catch {} finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const deletePaper = async (id: string) => {
    await apiFetch(`/api/papers/${id}`, { method: 'DELETE' });
    setSelectedPaper(null);
    await load();
  };

  const archivePaper = async (id: string, archived: boolean) => {
    await apiFetch(`/api/papers/${id}/archive`, { method: 'PUT', body: JSON.stringify({ archived }) });
    await load();
  };

  const paperNotes = (paperId: string) => notes.filter(n => n.paperId === paperId);

  if (selectedPaper) {
    return (
      <ReadingView
        paper={selectedPaper}
        notes={paperNotes(selectedPaper.id)}
        onBack={() => { setSelectedPaper(null); load(); }}
        language={language}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <BookOpen size={24} className="text-on-surface-secondary" />
          <h1 className="text-xl font-semibold text-on-surface">
            {isRTL ? 'الملفات البحثية' : 'Research Files'}
          </h1>
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.md,.xlsx,.csv" onChange={handleUpload} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {isRTL ? 'رفع ملف' : 'Upload File'}
          </button>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 items-center">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={cn(
              'px-3 py-1.5 rounded-[var(--radius)] text-xs font-medium border transition-colors whitespace-nowrap',
              activeCategory === cat.id
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-on-surface-secondary hover:bg-surface-secondary'
            )}
          >
            {cat.label}
          </button>
        ))}
        <ShowArchivedToggle value={showArchived} onChange={setShowArchived} isRTL={isRTL} className="ml-auto" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-on-surface-tertiary">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : papers.length === 0 ? (
        <div className="text-center py-16 text-on-surface-tertiary">
          <FileText size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-sm">{isRTL ? 'لا توجد ملفات بعد. ارفع أول ملف بحثي.' : 'No files yet. Upload your first research file.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {papers.filter((p) => activeCategory === 'all' || (p as Paper & { category?: string }).category === activeCategory || (!('category' in p) && activeCategory === 'papers')).map((paper) => (
            <div key={paper.id} className={cn('border border-border rounded-[var(--radius-lg)] p-4 hover:bg-surface-secondary/50 transition-colors', paper.archived && 'opacity-60')}>
              <div className="flex items-start justify-between gap-4">
                <button onClick={() => setSelectedPaper(paper)} className="flex-1 text-start">
                  <p className="text-sm font-medium text-on-surface">{paper.title || paper.filename}</p>
                  {paper.authors && <p className="text-xs text-on-surface-tertiary mt-1">{paper.authors}</p>}
                  <div className="flex gap-4 mt-2 text-xs text-on-surface-tertiary">
                    <span>{paper.pages} {isRTL ? 'صفحة' : 'pages'}</span>
                    <span>{paper.sections.length} {isRTL ? 'قسم' : 'sections'}</span>
                    <span>{paperNotes(paper.id).length} {isRTL ? 'ملاحظة' : 'notes'}</span>
                  </div>
                </button>
                <ItemMenu
                  isRTL={isRTL}
                  archived={!!paper.archived}
                  onArchive={() => archivePaper(paper.id, true)}
                  onUnarchive={() => archivePaper(paper.id, false)}
                  onDelete={() => deletePaper(paper.id)}
                  deleteConfirmMessage={isRTL ? 'حذف هذه الورقة وملاحظاتها نهائيًا؟' : 'Delete this paper and its notes permanently?'}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const GUIDED_QUESTIONS = {
  en: [
    'What is the central claim?',
    'What evidence is presented?',
    'What methodology is used?',
    'What are the limitations?',
    'How does this connect to other papers?',
  ],
  ar: [
    'ما هو الادعاء المركزي؟',
    'ما هي الأدلة المقدمة؟',
    'ما هي المنهجية المستخدمة؟',
    'ما هي القيود؟',
    'كيف يرتبط هذا بأوراق أخرى؟',
  ],
};

function ReadingView({ paper, notes, onBack, language }: { paper: Paper; notes: Note[]; onBack: () => void; language: 'en' | 'ar' }) {
  const isRTL = language === 'ar';
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState<string>('claim');
  const [saving, setSaving] = useState(false);
  const [showGuided, setShowGuided] = useState(true);

  const saveNote = async (sectionTitle: string) => {
    if (!noteContent.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/api/notes', {
        method: 'POST',
        body: JSON.stringify({
          paperId: paper.id,
          section: sectionTitle,
          type: noteType,
          content: noteContent,
          themes: [],
        }),
      });
      setNoteContent('');
    } catch {} finally { setSaving(false); }
  };

  const sectionNotes = (section: string) => notes.filter(n => n.section === section);
  const currentSection = expandedIdx !== null ? paper.sections[expandedIdx] : null;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-3 flex items-center gap-4 shrink-0">
        <button onClick={onBack} className="text-sm text-accent hover:underline">
          {isRTL ? '← رجوع' : '← Back'}
        </button>
        <h2 className="text-sm font-medium text-on-surface truncate">{paper.title || paper.filename}</h2>
      </div>

      {/* Split-screen layout: sections nav + content on left, notes on right (desktop) */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* Left panel: Section text (60% on desktop) */}
        <div className="flex-1 md:w-[60%] md:flex-none overflow-auto px-6 py-4">
          <div className="max-w-2xl mx-auto space-y-3">
            {paper.sections.map((section, idx) => (
              <div key={idx} className="border border-border rounded-[var(--radius-lg)] overflow-hidden">
                <button
                  onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-secondary/50 transition-colors text-start"
                >
                  <span className="text-sm font-medium text-on-surface">{section.title || `Section ${idx + 1}`}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-on-surface-tertiary">{sectionNotes(section.title).length} {isRTL ? 'ملاحظة' : 'notes'}</span>
                    {expandedIdx === idx ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>

                {expandedIdx === idx && (
                  <div className="border-t border-border">
                    {/* Section text */}
                    <div className="px-4 py-3 bg-surface-secondary/30 text-sm text-on-surface leading-relaxed overflow-auto" dir="auto">
                      {section.content}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right panel: Notes + Guided Questions (40% on desktop, sticky) */}
        <div className="md:w-[40%] md:flex-none border-t md:border-t-0 md:border-l border-border overflow-auto bg-surface-secondary/20">
          <div className="p-4 space-y-4 md:sticky md:top-0">
            {/* Guided Questions */}
            <div className="border border-accent/20 rounded-[var(--radius-lg)] overflow-hidden">
              <button
                onClick={() => setShowGuided(!showGuided)}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-accent/5 hover:bg-accent/10 transition-colors text-start"
              >
                <HelpCircle size={14} className="text-accent shrink-0" />
                <span className="text-xs font-medium text-accent flex-1">
                  {isRTL ? 'أسئلة شواشة الموجهة' : "Shawasha's Guided Questions"}
                </span>
                {showGuided ? <ChevronUp size={12} className="text-accent" /> : <ChevronDown size={12} className="text-accent" />}
              </button>
              {showGuided && (
                <div className="px-4 py-3 space-y-2">
                  {GUIDED_QUESTIONS[language].map((q, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-xs text-on-surface-secondary cursor-pointer hover:text-on-surface transition-colors"
                      onClick={() => setNoteContent(q + ' ')}
                    >
                      <span className="text-accent font-mono shrink-0">{i + 1}.</span>
                      <span>{q}</span>
                    </div>
                  ))}
                  <p className="text-[10px] text-on-surface-tertiary mt-2 italic">
                    {isRTL ? 'اضغط على سؤال لنسخه إلى الملاحظة' : 'Click a question to copy to note'}
                  </p>
                </div>
              )}
            </div>

            {/* Existing notes for current section */}
            {currentSection && (
              <div className="space-y-3">
                <p className="text-xs text-on-surface-tertiary font-medium px-1">
                  {isRTL ? 'ملاحظات:' : 'Notes for:'} {currentSection.title || `Section ${(expandedIdx ?? 0) + 1}`}
                </p>

                {sectionNotes(currentSection.title).length > 0 && (
                  <div className="space-y-2">
                    {sectionNotes(currentSection.title).map(note => (
                      <div key={note.id} className="text-xs bg-accent/5 border border-accent/10 rounded-[var(--radius)] px-3 py-2">
                        <span className="text-accent font-medium">[{note.type}]</span> {note.content}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add note */}
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {['claim', 'evidence', 'method', 'critique', 'question', 'connection'].map(t => (
                      <button
                        key={t}
                        onClick={() => setNoteType(t)}
                        className={cn(
                          'px-2 py-1 rounded text-xs transition-colors',
                          noteType === t ? 'bg-accent text-on-accent' : 'bg-surface-secondary text-on-surface-secondary hover:bg-surface-tertiary'
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder={isRTL ? 'اكتب ملاحظتك...' : 'Write your note...'}
                    dir="auto"
                    rows={3}
                    className="w-full text-sm px-3 py-2 bg-input border border-border rounded-[var(--radius)] text-on-surface placeholder:text-on-surface-tertiary focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                  <button
                    onClick={() => saveNote(currentSection.title)}
                    disabled={!noteContent.trim() || saving}
                    className="w-full px-3 py-2 rounded-[var(--radius)] text-sm bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : isRTL ? 'حفظ الملاحظة' : 'Save Note'}
                  </button>
                </div>
              </div>
            )}

            {!currentSection && (
              <p className="text-xs text-on-surface-tertiary text-center py-4">
                {isRTL ? 'اختر قسمًا لبدء تدوين الملاحظات' : 'Select a section to start taking notes'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
