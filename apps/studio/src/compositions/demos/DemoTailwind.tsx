// Demo: @remotion/tailwind — gradient text + blurred floating cards (isNew: true)
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

const CARDS = [
  { label: 'سرعة', hue1: '#ffd3b6', hue2: '#ffaaa5' },
  { label: 'أناقة', hue1: '#d9c4f0', hue2: '#b19cd9' },
  { label: 'مرونة', hue1: '#b8e4d0', hue2: '#a8e6cf' },
];

const DemoTailwind: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hue = (frame * 1.4) % 360;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, hsl(${hue}, 60%, 96%) 0%, hsl(${(hue + 60) % 360}, 55%, 94%) 100%)`,
        fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ position: 'absolute', top: 260, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ fontSize: 20, letterSpacing: 10, color: '#8b8394', fontWeight: 300, marginBottom: 20 }}>TAILWIND · تصميم</div>
        <div
          style={{
            fontSize: 140,
            fontWeight: 800,
            letterSpacing: '-3px',
            backgroundImage: `linear-gradient(120deg, hsl(${hue}, 70%, 55%), hsl(${(hue + 80) % 360}, 75%, 60%), hsl(${(hue + 160) % 360}, 70%, 58%))`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            lineHeight: 1,
          }}
        >
          تصميم سريع
        </div>
      </div>

      <div style={{ display: 'flex', gap: 32, marginTop: 200 }}>
        {CARDS.map((c, i) => {
          const s = spring({ frame: frame - 30 - i * 12, fps, config: { damping: 14 } });
          const float = Math.sin((frame - i * 20) / 24) * 18;
          return (
            <div
              key={i}
              style={{
                width: 240,
                height: 320,
                borderRadius: 32,
                background: `linear-gradient(160deg, ${c.hue1}ee, ${c.hue2}cc)`,
                backdropFilter: 'blur(20px)',
                boxShadow: '0 20px 60px rgba(120, 100, 140, 0.18), inset 0 1px 0 rgba(255,255,255,0.6)',
                transform: `translateY(${(1 - s) * 60 + float}px) scale(${0.8 + s * 0.2})`,
                opacity: s,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                padding: 28,
                border: '1px solid rgba(255,255,255,0.5)',
              }}
            >
              <div style={{ fontSize: 20, color: 'rgba(60,40,80,0.6)', fontWeight: 300, marginBottom: 6 }}>0{i + 1}</div>
              <div style={{ fontSize: 44, color: '#2d1f3d', fontWeight: 700 }}>{c.label}</div>
            </div>
          );
        })}
      </div>

      <div style={{ position: 'absolute', bottom: 200, textAlign: 'center', fontSize: 24, color: '#6b5f7a', fontWeight: 300, letterSpacing: 3 }}>
        utility-first • rtl-ready
      </div>
    </AbsoluteFill>
  );
};

export default DemoTailwind;
