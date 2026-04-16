// Demo: ElevenLabs — Cinematic Arabic quote with live waveform + floating particles (isNew: true)
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

const QUOTE_WORDS = ['السلام', 'عليكم،', 'هذا', 'مثال', 'على', 'التعليق', 'الصوتي', 'العربي', 'من', 'نص', 'مكتوب'];

const MyVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const introO = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const mainO = spring({ frame: frame - 25, fps, config: { damping: 16 } });
  const captionReveal = interpolate(frame, [30, 200], [0, QUOTE_WORDS.length], { extrapolateRight: 'clamp' });

  // Animated waveform bars (40 bars)
  const bars = Array.from({ length: 40 }, (_, i) => {
    const phase = (frame - i * 2) / 5;
    const h = 40 + Math.abs(Math.sin(phase)) * 160 + Math.abs(Math.sin(phase * 2.3)) * 80;
    const hue = 160 + Math.sin((frame + i * 5) / 30) * 30;
    return { i, h, hue };
  });

  // Orbital particles
  const particles = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2 + frame / 100;
    const radius = 380 + Math.sin((frame + i * 30) / 20) * 40;
    return {
      x: 540 + Math.cos(angle) * radius,
      y: 960 + Math.sin(angle) * radius,
      size: 4 + Math.abs(Math.sin((frame + i * 12) / 15)) * 6,
      hue: 160 + i * 10,
    };
  });

  // Pulse ring scale
  const ringPulse = 1 + Math.sin(frame / 10) * 0.08;

  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, #0a1a1a 0%, #050a1a 100%)', direction: 'rtl', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      {/* Background mesh gradient spots */}
      <div style={{ position: 'absolute', top: '20%', left: '-10%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, #10b98144 0%, transparent 70%)', filter: 'blur(80px)' }} />
      <div style={{ position: 'absolute', bottom: '10%', right: '-10%', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, #06b6d455 0%, transparent 70%)', filter: 'blur(100px)' }} />

      {/* Orbital particles */}
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0, opacity: mainO }}>
        {particles.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={p.size} fill={`hsl(${p.hue}, 90%, 60%)`} opacity={0.7} style={{ filter: `blur(1px)` }} />
        ))}
      </svg>

      {/* Top tag */}
      <div style={{ position: 'absolute', top: 80, width: '100%', textAlign: 'center', opacity: introO }}>
        <div style={{ display: 'inline-block', padding: '12px 32px', background: 'linear-gradient(90deg, #10b981, #06b6d4)', borderRadius: 999, color: '#fff', fontSize: 24, fontWeight: 800, letterSpacing: 3, boxShadow: '0 10px 40px rgba(16,185,129,0.5)' }}>
          ELEVENLABS · تعليق صوتي AI
        </div>
      </div>

      {/* Main title */}
      <div style={{ position: 'absolute', top: 180, width: '100%', textAlign: 'center', opacity: mainO, transform: `translateY(${(1 - mainO) * 30}px)` }}>
        <h1 style={{ fontSize: 90, color: '#fff', fontWeight: 900, margin: 0, background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #8b5cf6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: -2 }}>
          صوت عربي طبيعي
        </h1>
        <p style={{ fontSize: 22, color: 'rgba(255,255,255,0.7)', marginTop: 8, fontWeight: 300, letterSpacing: 2 }}>
          MULTILINGUAL V2 · 29 LANGUAGES
        </p>
      </div>

      {/* Central waveform + pulse ring */}
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, transform: 'translateY(-50%)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {/* Pulse rings */}
        <svg width={720} height={720} style={{ position: 'absolute', opacity: mainO * 0.8 }}>
          <circle cx={360} cy={360} r={280 * ringPulse} fill="none" stroke="#10b981" strokeWidth={1.5} opacity={0.4} />
          <circle cx={360} cy={360} r={220 * ringPulse} fill="none" stroke="#06b6d4" strokeWidth={1.5} opacity={0.5} />
          <circle cx={360} cy={360} r={160 * ringPulse} fill="none" stroke="#10b981" strokeWidth={1.5} opacity={0.6} />
        </svg>

        {/* Waveform */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: mainO, height: 280 }}>
          {bars.map((b) => (
            <div key={b.i} style={{
              width: 12,
              height: b.h,
              background: `linear-gradient(180deg, hsl(${b.hue}, 90%, 60%) 0%, hsl(${b.hue + 30}, 90%, 40%) 100%)`,
              borderRadius: 6,
              boxShadow: `0 0 15px hsl(${b.hue}, 90%, 60%, 0.7)`,
            }} />
          ))}
        </div>
      </div>

      {/* Caption with per-word reveal */}
      <div style={{ position: 'absolute', bottom: 200, left: 60, right: 60, padding: '26px 36px', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(16px)', borderRadius: 24, border: '1px solid rgba(16,185,129,0.3)', opacity: mainO }}>
        <p style={{ fontSize: 32, color: '#fff', lineHeight: 1.7, textAlign: 'center', margin: 0, fontWeight: 500 }}>
          {QUOTE_WORDS.map((w, i) => {
            const shown = i < captionReveal;
            const highlighted = Math.floor(captionReveal) === i;
            return (
              <span key={i} style={{
                opacity: shown ? 1 : 0.15,
                color: highlighted ? '#10b981' : '#fff',
                fontWeight: highlighted ? 900 : 500,
                transition: 'all 200ms',
                margin: '0 4px',
                display: 'inline-block',
              }}>{w}</span>
            );
          })}
        </p>
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: 70, width: '100%', textAlign: 'center', opacity: mainO * 0.6 }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, letterSpacing: 2 }}>
          10,000 characters/month · free tier
        </p>
      </div>
    </AbsoluteFill>
  );
};

export default MyVideo;
