'use client';

import { useRef, useEffect, useCallback } from 'react';

export type OrbState = 'idle' | 'listening' | 'processing' | 'speaking';

interface VoiceOrbProps {
  state: OrbState;
  audioLevel: number; // 0-1 normalized audio level
}

const DOT_COUNT = 24;

export function VoiceOrb({ state, audioLevel }: VoiceOrbProps) {
  const orbRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number>(0);
  const timeRef = useRef(0);

  const animate = useCallback(() => {
    timeRef.current += 0.016; // ~60fps
    const t = timeRef.current;

    const orb = orbRef.current;
    if (orb) {
      if (state === 'listening') {
        // Map audio level to orb scale and morph
        const scale = 1 + audioLevel * 0.15;
        const r1 = 48 + Math.sin(t * 2) * (2 + audioLevel * 8);
        const r2 = 52 - Math.sin(t * 2.3) * (2 + audioLevel * 8);
        const r3 = 50 + Math.cos(t * 1.7) * (2 + audioLevel * 6);
        const r4 = 50 - Math.cos(t * 2.1) * (2 + audioLevel * 6);
        orb.style.transform = `scale(${scale})`;
        orb.style.borderRadius = `${r1}% ${r2}% ${r3}% ${r4}%`;
        orb.style.boxShadow = `0 0 ${40 + audioLevel * 60}px rgba(124, 90, 237, ${0.3 + audioLevel * 0.4})`;
      } else if (state === 'speaking') {
        // Simulate speech rhythm
        const speechLevel = 0.3 + Math.abs(Math.sin(t * 4)) * 0.5 + Math.sin(t * 7) * 0.2;
        const scale = 1.02 + speechLevel * 0.1;
        const r1 = 48 + Math.sin(t * 3) * speechLevel * 6;
        const r2 = 52 - Math.cos(t * 2.5) * speechLevel * 6;
        const r3 = 50 + Math.sin(t * 1.8) * speechLevel * 5;
        const r4 = 50 - Math.cos(t * 2.8) * speechLevel * 5;
        orb.style.transform = `scale(${scale})`;
        orb.style.borderRadius = `${r1}% ${r2}% ${r3}% ${r4}%`;
        orb.style.boxShadow = `0 0 ${40 + speechLevel * 50}px rgba(124, 90, 237, ${0.3 + speechLevel * 0.35})`;
      } else {
        // Reset inline styles so CSS animations take over
        orb.style.transform = '';
        orb.style.borderRadius = '';
        orb.style.boxShadow = '';
      }
    }

    // Animate dot ring
    dotsRef.current.forEach((dot, i) => {
      if (!dot) return;
      const angle = (i / DOT_COUNT) * Math.PI * 2;
      // Base radius of the ring (slightly larger than orb)
      const baseRadius = 55; // percentage from center
      let radius = baseRadius;
      let dotOpacity = 0.3;
      let dotScale = 1;

      if (state === 'listening') {
        // Dots dance with audio
        const wave = Math.sin(angle * 3 + t * 5) * audioLevel;
        radius = baseRadius + wave * 12;
        dotOpacity = 0.3 + audioLevel * 0.6;
        dotScale = 1 + audioLevel * 0.8;
      } else if (state === 'speaking') {
        const wave = Math.sin(angle * 4 + t * 6) * 0.5;
        radius = baseRadius + wave * 8;
        dotOpacity = 0.3 + Math.abs(Math.sin(t * 3 + i)) * 0.4;
        dotScale = 1 + Math.abs(Math.sin(t * 4 + i * 0.5)) * 0.5;
      } else if (state === 'idle') {
        const wave = Math.sin(angle * 2 + t * 1.5) * 0.15;
        radius = baseRadius + wave * 4;
        dotOpacity = 0.15 + Math.sin(t + i * 0.3) * 0.1;
      } else {
        // Processing: dots are hidden (spinner replaces them)
        dotOpacity = 0;
      }

      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      dot.style.transform = `translate(${x}px, ${y}px) scale(${dotScale})`;
      dot.style.opacity = `${dotOpacity}`;
    });

    rafRef.current = requestAnimationFrame(animate);
  }, [state, audioLevel]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [animate]);

  const orbClass = `voice-orb voice-orb--${state}`;

  return (
    <div className="voice-orb-wrap">
      <div ref={orbRef} className={orbClass} />

      {/* Dot Ring */}
      <div className="voice-dot-ring">
        {Array.from({ length: DOT_COUNT }).map((_, i) => (
          <div
            key={i}
            ref={(el) => { dotsRef.current[i] = el; }}
            className="voice-dot"
          />
        ))}
      </div>

      {/* Processing Spinner */}
      {state === 'processing' && (
        <div className="voice-spinner">
          <div className="voice-spinner-dot" />
          <div className="voice-spinner-dot" />
          <div className="voice-spinner-dot" />
          <div className="voice-spinner-dot" />
        </div>
      )}
    </div>
  );
}
