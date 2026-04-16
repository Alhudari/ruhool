'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Bot, FileText, Lightbulb, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface ResultCardProps {
  content: string;
  agentName: string;
  isRTL: boolean;
}

interface Section {
  title: string;
  content: string;
  level: number;
}

function parseResearchContent(content: string): { title: string; sections: Section[]; references: string | null } {
  const lines = content.split('\n');
  let title = '';
  const sections: Section[] = [];
  let references: string | null = null;
  let currentSection: Section | null = null;
  let refStarted = false;

  for (const line of lines) {
    // Check for references section
    if (/^#{1,3}\s+references/i.test(line) || /^\*\*references\*\*/i.test(line)) {
      refStarted = true;
      references = '';
      continue;
    }

    if (refStarted) {
      references += line + '\n';
      continue;
    }

    // Detect heading levels
    const h2Match = line.match(/^##\s+(.+)/);
    const h3Match = line.match(/^###\s+(.+)/);

    if (h2Match || h3Match) {
      const heading = h2Match ? h2Match[1] : h3Match![1];
      const level = h2Match ? 2 : 3;

      if (!title && level === 2) {
        title = heading;
      }

      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { title: heading, content: '', level };
    } else if (currentSection) {
      currentSection.content += line + '\n';
    } else {
      // Content before first heading becomes a preamble section
      if (line.trim()) {
        if (!currentSection) {
          currentSection = { title: '', content: '', level: 0 };
        }
        currentSection.content += line + '\n';
      }
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return { title: title || 'Research Results', sections, references: references?.trim() || null };
}

/** Detect if a message looks like a structured research result.
 * Only returns true for LONG, structured responses with many sections. Short answers stay inline.
 */
export function isResearchResult(content: string): boolean {
  if (content.length < 800) return false;                                   // short answers: inline
  const sectionCount = (content.match(/^#{2,3}\s+/gm) || []).length;
  if (sectionCount < 3) return false;                                       // need ≥3 sections to warrant card
  const hasReferences = /\*\*references\*\*/i.test(content) || /^#{1,3}\s+references/im.test(content);
  const hasMultipleSections = sectionCount >= 4;
  return hasReferences || hasMultipleSections;
}

export function ResultCard({ content, agentName, isRTL }: ResultCardProps) {
  const { title, sections, references } = parseResearchContent(content);
  // Default: all sections OPEN (was: only section 0)
  const [expandedSections, setExpandedSections] = useState<Set<number>>(() => new Set(sections.map((_, i) => i)));
  const [showReferences, setShowReferences] = useState(true);

  const toggleSection = (idx: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };
  const allOpen = expandedSections.size === sections.length;
  const toggleAll = () => {
    if (allOpen) setExpandedSections(new Set());
    else setExpandedSections(new Set(sections.map((_, i) => i)));
  };

  const proseClasses =
    'text-sm text-on-surface leading-relaxed break-words prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-code:text-accent prose-code:bg-surface-secondary prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-surface-secondary prose-pre:rounded-lg prose-pre:p-3';

  return (
    <div className="border border-accent/20 rounded-[var(--radius-lg)] bg-surface-secondary/30 overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-3 bg-accent/5 border-b border-accent/10">
        <div className="w-6 h-6 rounded-full bg-accent/10 text-accent flex items-center justify-center">
          <Bot size={14} />
        </div>
        <span className="text-xs font-medium text-accent">{agentName}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-on-surface-tertiary">
          <FileText size={12} />
          <span className="text-[10px]">
            {sections.length} {isRTL ? 'اقسام' : 'sections'}
          </span>
          <button
            onClick={toggleAll}
            className="ml-2 px-2 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent hover:bg-accent/20 flex items-center gap-1"
            title={allOpen ? (isRTL ? 'إغلاق الكل' : 'Collapse all') : (isRTL ? 'فتح الكل' : 'Expand all')}
          >
            {allOpen ? <ChevronsDownUp size={11} /> : <ChevronsUpDown size={11} />}
            {allOpen ? (isRTL ? 'طي' : 'Collapse') : (isRTL ? 'فتح' : 'Expand')}
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-base font-semibold text-on-surface">{title}</h3>
      </div>

      {/* Collapsible sections */}
      <div className="divide-y divide-border">
        {sections.map((section, idx) => {
          // Skip the title section if it matches the card title
          if (section.title === title && idx === 0 && !section.content.trim()) return null;

          const isExpanded = expandedSections.has(idx);
          const hasKeyFindings =
            section.content.includes('**') ||
            section.content.includes('- ') ||
            section.content.includes('1. ');

          return (
            <div key={idx}>
              {section.title && (
                <button
                  onClick={() => toggleSection(idx)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-surface-secondary/50 transition-colors text-start"
                >
                  {isExpanded ? (
                    <ChevronDown size={14} className="text-on-surface-tertiary shrink-0" />
                  ) : (
                    <ChevronRight size={14} className="text-on-surface-tertiary shrink-0" />
                  )}
                  <span className="text-sm font-medium text-on-surface flex-1">{section.title}</span>
                  {hasKeyFindings && (
                    <Lightbulb size={12} className="text-amber-500 shrink-0" />
                  )}
                </button>
              )}
              {(isExpanded || !section.title) && section.content.trim() && (
                <div
                  className={cn('px-4 pb-3', section.title && 'pt-0 pl-10')}
                  dir={/[\u0600-\u06FF]/.test(section.content) ? 'rtl' : 'ltr'}
                >
                  <div className={proseClasses}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {section.content.trim()}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* References */}
      {references && (
        <div className="border-t border-accent/10">
          <button
            onClick={() => setShowReferences(!showReferences)}
            className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-surface-secondary/50 transition-colors text-start bg-accent/5"
          >
            {showReferences ? (
              <ChevronDown size={14} className="text-accent shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-accent shrink-0" />
            )}
            <span className="text-sm font-medium text-accent">
              {isRTL ? 'المراجع' : 'References'}
            </span>
          </button>
          {showReferences && (
            <div className="px-4 pb-3 pl-10">
              <div className={cn(proseClasses, 'text-xs opacity-80')}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{references}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
