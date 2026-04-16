// Demo: Stable Audio — Galactic music visualizer with floating notes + frequency spectrum (isNew: true)
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

const PROMPT_EXAMPLES = [
  { text: 'calm arabic oud music with light percussion', lang: 'en' },
  { text: 'cinematic orchestral build-up, 80 BPM', lang: 'en' },
  { text: 'lofi hip-hop beat with rainy ambience', lang: 'en' },
];

const NOTE_SYMBOLS = ['♪', '♫', '♬', '♩', '♭', '♯'];

const MyVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const introO = spring({ frame, fps, config: { damping: 15 } });
  const mainO = spring({ frame: frame - 20, fps, config: { damping: 18 } });
  const promptsO = spring({ frame: frame - 80, fps, config: { damping: 14 } });

  const centerX = 540, centerY = 960;

  // Concentric rotating rings with frequency bars
  const rings = [
    { radius: 120, bars: 16, speed: 0.5 },
    { radius: 180, bars: 24, speed: -0.8 },
    { radius: 250, bars: 32, speed: 0.6 },
    { radius: 330, bars: 40, speed: -0.4 },
  ];

  // Floating music notes
  const notes = Array.from({ length: 12 }, (_, i) => {
    const t = (frame + i * 40) / 60;
    const angle = (i / 12) * Math.PI * 2;
    const dist = 500 + Math.sin(t) * 80;
    const x = centerX + Math.cos(angle + frame / 80) * dist;
    const y = centerY + Math.sin(angle + frame / 80) * dist;
    const sym = NOTE_SYMBOLS[i % NOTE_SYMBOLS.length];
    const scale = 0.8 + Math.abs(Math.sin((frame + i * 20) / 25)) * 0.6;
    const hue = (i * 30 + frame) % 360;
    return { x, y, sym, scale, hue };
  });

  // Cosmic background stars
  const stars = Array.from({ length: 60 }, (_, i) => {
    const x = (i * 177) % 1080;
    const y = (i * 251) % 1920;
    const twinkle = 0.3 + Math.abs(Math.sin((frame + i * 7) / 20)) * 0.7;
    const size = 1 + (i % 3);
    return { x, y, twinkle, size };
  });

  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 50%, #2a0f4a 0%, #0a0515 60%, #05020a 100%)', direction: 'rtl', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      {/* Stars */}
      {stars.map((s, i) => (
        <div key={i} style={{ position: 'absolute', left: s.x, top: s.y, width: s.size, height: s.size, background: '#fff', opacity: s.twinkle, borderRadius: '50%', boxShadow: '0 0 4px #fff' }} />
      ))}

      {/* Nebula blobs */}
      <div style={{ position: 'absolute', top: '30%', left: '-15%', width: 700, height: 700, background: 'radial-gradient(circle, #d946ef55 0%, transparent 70%)', filter: 'blur(80px)', borderRadius: '50%' }} />
      <div style={{ position: 'absolute', bottom: '15%', right: '-10%', width: 600, height: 600, background: 'radial-gradient(circle, #06b6d455 0%, transparent 70%)', filter: 'blur(80px)', borderRadius: '50%' }} />

      {/* SVG visualizer */}
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0, opacity: mainO }}>
        <defs>
          <radialGradient id="centerGlow">
            <stop offset="0%" stopColor="#d946ef" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#d946ef" stopOpacity={0} />
          </radialGradient>
          <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#d946ef" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>

        {/* Center glow */}
        <circle cx={centerX} cy={centerY} r={200} fill="url(#centerGlow)" opacity={0.6} />

        {/* Rotating frequency rings */}
        {rings.map((r, ri) => (
          <g key={ri} transform={`rotate(${frame * r.speed * 0.8} ${centerX} ${centerY})`}>
            {Array.from({ length: r.bars }).map((_, bi) => {
              const angle = (bi / r.bars) * Math.PI * 2;
              const phase = (frame + bi * 5 + ri * 20) / 8;
              const len = 30 + Math.abs(Math.sin(phase) + Math.sin(phase * 1.7)) * 60;
              const x1 = centerX + Math.cos(angle) * r.radius;
              const y1 = centerY + Math.sin(angle) * r.radius;
              const x2 = centerX + Math.cos(angle) * (r.radius + len);
              const y2 = centerY + Math.sin(angle) * (r.radius + len);
              return <line key={bi} x1={x1} y1={y1} x2={x2} y2={y2} stroke="url(#barGrad)" strokeWidth={5} strokeLinecap="round" opacity={0.85} />;
            })}
            <circle cx={centerX} cy={centerY} r={r.radius} fill="none" stroke="#d946ef" strokeWidth={1} opacity={0.2} strokeDasharray="4 8" />
          </g>
        ))}

        {/* Center note */}
        <g transform={`translate(${centerX}, ${centerY})`}>
          <circle r={80} fill="rgba(217,70,239,0.3)" />
          <circle r={60} fill="rgba(217,70,239,0.6)" />
          <text y={28} textAnchor="middle" fontSize={80} fill="#fff" fontWeight="bold">♪</text>
        </g>
      </svg>

      {/* Floating notes */}
      {notes.map((n, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: n.x, top: n.y,
          fontSize: 48,
          transform: `scale(${n.scale})`,
          color: `hsl(${n.hue}, 80%, 70%)`,
          textShadow: `0 0 20px hsl(${n.hue}, 80%, 60%)`,
          opacity: mainO * 0.8,
          pointerEvents: 'none',
        }}>{n.sym}</div>
      ))}

      {/* Title */}
      <div style={{ position: 'absolute', top: 130, width: '100%', textAlign: 'center', opacity: introO }}>
        <div style={{ display: 'inline-block', padding: '12px 32px', background: 'linear-gradient(90deg, #d946ef, #8b5cf6)', borderRadius: 999, color: '#fff', fontSize: 22, fontWeight: 800, letterSpacing: 3, boxShadow: '0 10px 40px rgba(217,70,239,0.6)' }}>
          STABLE AUDIO · STABILITY AI
        </div>
        <h1 style={{ fontSize: 84, color: '#fff', fontWeight: 900, marginTop: 20, background: 'linear-gradient(135deg, #d946ef 0%, #8b5cf6 50%, #06b6d4 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: -2 }}>
          من نص إلى موسيقى
        </h1>
        <p style={{ fontSize: 22, color: 'rgba(255,255,255,0.7)', marginTop: 8, fontWeight: 300, letterSpacing: 2 }}>
          TEXT → MUSIC · UP TO 47 SECONDS
        </p>
      </div>

      {/* Prompt examples */}
      <div style={{ position: 'absolute', bottom: 160, left: 40, right: 40, display: 'flex', flexDirection: 'column', gap: 12, opacity: promptsO }}>
        {PROMPT_EXAMPLES.map((p, i) => (
          <div key={i} style={{
            padding: '14px 22px',
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(12px)',
            borderRadius: 14,
            border: '1px solid rgba(217,70,239,0.4)',
            color: 'rgba(255,255,255,0.95)',
            fontSize: 18,
            fontFamily: 'monospace',
            direction: 'ltr',
            textAlign: 'start',
            opacity: spring({ frame: frame - 90 - i * 15, fps, config: { damping: 14 } }),
          }}>
            <span style={{ color: '#d946ef', marginInlineEnd: 8 }}>prompt:</span>
            &ldquo;{p.text}&rdquo;
          </div>
        ))}
      </div>

      <div style={{ position: 'absolute', bottom: 70, width: '100%', textAlign: 'center', opacity: mainO * 0.6 }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, letterSpacing: 2 }}>
          25 FREE CREDITS ON SIGNUP
        </p>
      </div>
    </AbsoluteFill>
  );
};

export default MyVideo;
