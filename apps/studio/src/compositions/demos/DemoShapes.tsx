// Demo: Building types — 5 pastel shapes with staggered spring entry
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

const shapes = [
  { color: '#b19cd9', label: 'سكني' },
  { color: '#a8e6cf', label: 'تجاري' },
  { color: '#ffaaa5', label: 'صناعي' },
  { color: '#ffd3b6', label: 'إداري' },
  { color: '#a7c7e7', label: 'تعليمي' },
];

const DemoShapes: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg,#fafaf7 0%,#f5f0ea 100%)', justifyContent: 'center', alignItems: 'center', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      <div style={{ fontSize: 64, fontWeight: 700, color: '#1a1a1a', marginBottom: 80, letterSpacing: 6 }}>أنواع المباني</div>
      <div style={{ display: 'flex', gap: 36 }}>
        {shapes.map((s, i) => {
          const sp = spring({ frame: frame - i * 6, fps, config: { damping: 18, stiffness: 100 } });
          const y = interpolate(sp, [0, 1], [80, 0]);
          const rot = interpolate(sp, [0, 1], [-8, 0]);
          return (
            <div key={i} style={{ transform: `translateY(${y}px) rotate(${rot}deg)`, opacity: sp, textAlign: 'center' }}>
              <div style={{ width: 140, height: 140, borderRadius: 28, background: s.color, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }} />
              <div style={{ marginTop: 24, fontSize: 32, color: '#2d3748', letterSpacing: 3 }}>{s.label}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export default DemoShapes;
