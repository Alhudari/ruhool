'use client';

import { useState, useEffect, useRef } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app';

export interface HelpStep {
  illustration: string; // emoji or short pictogram
  title: { ar: string; en: string };
  body: { ar: string; en: string };
}

// TH-01 (AUDIT.md): hex literals below are the Clippy character palette
// (paperclip silver, pupil black, stroke). Intentionally not themed.
// The famous Clippy paperclip with eyes, as inline SVG.
// Eyes track the user's mouse, with occasional idle glances elsewhere + natural
// double-blinks, eyebrow lifts, and a subtle breathing sway.
export type ClippyExpression = 'idle' | 'smile' | 'wink-left' | 'wink-right' | 'surprise' | 'thinking';

export function ClippySVG({ size = 80, expression = 'idle' }: { size?: number; expression?: ClippyExpression }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const idleRef = useRef<{ active: boolean; target: { x: number; y: number } }>({ active: false, target: { x: 0, y: 0 } });
  const [autoExpr, setAutoExpr] = useState<ClippyExpression>('idle');
  // Rotate a gentle expression every ~15–25s (unless parent forces one)
  useEffect(() => {
    if (expression !== 'idle') return;
    let timer: ReturnType<typeof setTimeout>;
    const cycle = () => {
      timer = setTimeout(() => {
        const pool: ClippyExpression[] = ['idle', 'smile', 'wink-left', 'wink-right', 'surprise', 'thinking'];
        setAutoExpr(pool[Math.floor(Math.random() * pool.length)]);
        // Hold expression 2–4s, then back to idle
        setTimeout(() => setAutoExpr('idle'), 2000 + Math.random() * 2000);
        cycle();
      }, 15000 + Math.random() * 10000);
    };
    cycle();
    return () => clearTimeout(timer);
  }, [expression]);
  const expr = expression !== 'idle' ? expression : autoExpr;

  useEffect(() => {
    const MAX = 2.2; // max pupil travel in SVG units
    const onMove = (e: MouseEvent) => {
      if (idleRef.current.active) return; // idle glance in progress → ignore mouse
      const el = svgRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 3; // eyes are in upper third of Clippy
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) { setOffset({ x: 0, y: 0 }); return; }
      // Normalize to MAX units; use soft clamp so near-eye movement doesn't overshoot
      const scale = Math.min(1, dist / 300); // saturates at ~300px
      const nx = (dx / dist) * MAX * scale;
      const ny = (dy / dist) * MAX * scale;
      setOffset({ x: nx, y: ny });
    };
    window.addEventListener('mousemove', onMove);

    // Occasional idle glance: every 5–9s briefly look somewhere random (or forward)
    // so Clippy doesn't feel like a tracking security camera.
    let timer: ReturnType<typeof setTimeout>;
    const scheduleIdle = () => {
      const wait = 5000 + Math.random() * 4000;
      timer = setTimeout(() => {
        const choices = [
          { x: -1.8, y: -0.5 },   // up-left
          { x: 1.8, y: -0.5 },    // up-right
          { x: 0, y: -1.2 },      // up (forward)
          { x: 0, y: 0 },         // forward / straight ahead
          { x: -1.5, y: 1 },      // down-left
          { x: 1.5, y: 1 },       // down-right
        ];
        const pick = choices[Math.floor(Math.random() * choices.length)];
        idleRef.current = { active: true, target: pick };
        setOffset(pick);
        // Hold the idle gaze for 1.2–2s, then release back to mouse tracking
        setTimeout(() => { idleRef.current.active = false; }, 1200 + Math.random() * 800);
        scheduleIdle();
      }, wait);
    };
    scheduleIdle();

    return () => {
      window.removeEventListener('mousemove', onMove);
      clearTimeout(timer);
    };
  }, []);

  return (
    <svg ref={svgRef} width={size} height={size * 1.4} viewBox="0 0 80 112" xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
      <style>{`
        /* --- BLINK ---
           Natural double-blink. Cycle is 9s so it feels relaxed, not jittery.
           Closures are ~140ms each, spaced 180ms apart — matches real human rate. */
        @keyframes clippyDoubleBlink {
          0%, 86%         { transform: scaleY(1); }
          88%             { transform: scaleY(0.06); }   /* close #1 */
          90%             { transform: scaleY(1); }      /* open */
          93%             { transform: scaleY(0.06); }   /* close #2 */
          95%, 100%       { transform: scaleY(1); }
        }
        .clippy-eye {
          transform-box: fill-box;
          transform-origin: center;
          animation: clippyDoubleBlink 9s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          animation-delay: 1.2s;
        }

        /* Pupil follow-target: JS sets the translate inline; we add a smooth
           transition so the pupil glides rather than teleports. */
        .clippy-pupil-wrap {
          transform-box: fill-box;
          transform-origin: center;
          transition: transform 0.4s cubic-bezier(0.3, 0, 0.1, 1);
        }
        /* Blink is applied to the eye shape itself (and pupil inherits via clip) */

        /* --- EYEBROW LIFT ---
           Occasional expressive raise (curious/surprised). Very subtle. */
        @keyframes clippyBrowLift {
          0%, 35%, 55%, 100%  { transform: translateY(0); }
          40%, 50%            { transform: translateY(-1.5px); }
        }
        .clippy-brow {
          transform-box: fill-box;
          transform-origin: center;
          animation: clippyBrowLift 11s ease-in-out infinite;
          animation-delay: 3s;
        }

        /* --- BODY SWAY ---
           Barely-there breathing. 4s slow oscillation. */
        @keyframes clippyBreath {
          0%, 100%  { transform: translateY(0) rotate(0deg); }
          50%       { transform: translateY(-1px) rotate(0.4deg); }
        }
        .clippy-root {
          transform-box: fill-box;
          transform-origin: 40px 92px;
          animation: clippyBreath 4.2s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .clippy-eye, .clippy-pupil, .clippy-brow, .clippy-root {
            animation: none;
          }
        }
      `}</style>

      <defs>
        {/* ClipPaths ensure the pupil never pokes outside the eye during blink */}
        <clipPath id="clippyEyeL"><ellipse cx="30" cy="38" rx="5" ry="9" /></clipPath>
        <clipPath id="clippyEyeR"><ellipse cx="50" cy="38" rx="5" ry="9" /></clipPath>
      </defs>
      <g className="clippy-root">
        {/* Body: bent paperclip */}
        <path
          d="M20 20 Q20 8 32 8 L48 8 Q60 8 60 20 L60 80 Q60 92 48 92 L32 92 Q20 92 20 80 L20 30 Q20 22 28 22 L44 22 Q52 22 52 30 L52 70 Q52 78 44 78 L36 78 Q28 78 28 70 L28 40"
          fill="none"
          stroke="#c0c0c0"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* Eyebrows (grouped so they lift together) */}
        <g className="clippy-brow">
          <path d="M24 26 Q30 22 36 26" fill="none" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M44 26 Q50 22 56 26" fill="none" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
        </g>

        {/* Left eye */}
        <g>
          {expr === 'wink-left' ? (
            // Closed wink — curved arc
            <path d="M25 38 Q30 41 35 38" fill="none" stroke="#333" strokeWidth="1.8" strokeLinecap="round" />
          ) : (
            <>
              <ellipse
                className="clippy-eye"
                cx="30" cy="38"
                rx={expr === 'surprise' ? 6 : 5}
                ry={expr === 'surprise' ? 10 : 9}
                fill="white" stroke="#333" strokeWidth="1.5"
              />
              <g clipPath="url(#clippyEyeL)">
                <g className="clippy-pupil-wrap" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
                  <circle cx="30" cy="38" r={expr === 'surprise' ? 3 : 2.6} fill="#1a1a1a" />
                </g>
              </g>
            </>
          )}
        </g>
        {/* Right eye */}
        <g>
          {expr === 'wink-right' ? (
            <path d="M45 38 Q50 41 55 38" fill="none" stroke="#333" strokeWidth="1.8" strokeLinecap="round" />
          ) : (
            <>
              <ellipse
                className="clippy-eye"
                cx="50" cy="38"
                rx={expr === 'surprise' ? 6 : 5}
                ry={expr === 'surprise' ? 10 : 9}
                fill="white" stroke="#333" strokeWidth="1.5"
              />
              <g clipPath="url(#clippyEyeR)">
                <g className="clippy-pupil-wrap" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
                  <circle cx="50" cy="38" r={expr === 'surprise' ? 3 : 2.6} fill="#1a1a1a" />
                </g>
              </g>
            </>
          )}
        </g>

        {/* Mouth — only for expressions that genuinely need one.
            Wink/blink intentionally have NO mouth so they read as pure eye gestures. */}
        {expr === 'smile' && (
          <path d="M32 54 Q40 60 48 54" fill="none" stroke="#333" strokeWidth="1.8" strokeLinecap="round" />
        )}
        {expr === 'surprise' && (
          <ellipse cx="40" cy="55" rx="2.5" ry="3" fill="#1a1a1a" />
        )}
        {expr === 'thinking' && (
          <path d="M34 55 Q40 53 46 55" fill="none" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
        )}
      </g>
    </svg>
  );
}

export function ClippyHelp({ steps, title }: { steps: HelpStep[]; title?: { ar: string; en: string } }) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  if (steps.length === 0) return null;
  const s = steps[Math.min(step, steps.length - 1)];

  return (
    <>
      <button
        onClick={() => { setOpen(true); setStep(0); }}
        className="p-2 rounded-full text-on-surface-tertiary hover:text-accent hover:bg-accent/10 transition-colors"
        title={isRTL ? 'مساعدة' : 'Help'}
      >
        <HelpCircle size={18} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="relative w-full max-w-md bg-surface border border-border rounded-[var(--radius-lg)] shadow-2xl flex gap-4 p-5"
            dir={isRTL ? 'rtl' : 'ltr'}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Clippy */}
            <div className="shrink-0 flex flex-col items-center">
              <ClippySVG size={72} />
              <div className="text-[9px] text-on-surface-tertiary mt-1 italic">Clippy</div>
            </div>

            {/* Speech bubble */}
            <div className="flex-1 min-w-0 relative">
              <button onClick={() => setOpen(false)} className="absolute top-0 end-0 p-1 text-on-surface-tertiary hover:text-on-surface">
                <X size={14} />
              </button>
              {title && <div className="text-sm font-bold text-on-surface mb-2">{title[language]}</div>}
              <div className="text-center mb-2">
                <div className="text-4xl leading-none mb-2">{s.illustration}</div>
                <div className="text-sm font-semibold text-on-surface">{s.title[language]}</div>
              </div>
              <div className="text-xs text-on-surface-secondary leading-relaxed whitespace-pre-wrap">{s.body[language]}</div>

              <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-border">
                <div className="text-[10px] text-on-surface-tertiary">{step + 1} / {steps.length}</div>
                <div className="flex gap-1">
                  <button disabled={step === 0} onClick={() => setStep((s) => s - 1)} className="px-2 py-1 rounded text-xs bg-surface-secondary disabled:opacity-30">
                    {isRTL ? '→' : '←'}
                  </button>
                  {step < steps.length - 1 ? (
                    <button onClick={() => setStep((s) => s + 1)} className="px-3 py-1 rounded bg-accent text-on-accent text-xs font-semibold">
                      {isRTL ? 'التالي ←' : 'Next →'}
                    </button>
                  ) : (
                    <button onClick={() => setOpen(false)} className="px-3 py-1 rounded bg-accent text-on-accent text-xs font-semibold">
                      {isRTL ? 'فهمت ✓' : 'Got it ✓'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
