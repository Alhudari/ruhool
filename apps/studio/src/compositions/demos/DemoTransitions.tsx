// Demo: BIM evolution — 3 light scenes with smooth fade transitions
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

const scenes = [
  { title: '1980s', sub: 'CAD', bg: 'linear-gradient(135deg,#fdfbf7 0%,#f5d491 100%)', color: '#2d3748' },
  { title: '2000s', sub: 'BIM', bg: 'linear-gradient(135deg,#fafaf7 0%,#a7c7e7 100%)', color: '#1a1a1a' },
  { title: '2025', sub: 'AI-BIM', bg: 'linear-gradient(135deg,#fff 0%,#b19cd9 100%)', color: '#1a1a1a' },
];

const DemoTransitions: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const perScene = 60;
  const idx = Math.min(Math.floor(frame / perScene), scenes.length - 1);
  const localFrame = frame - idx * perScene;
  const s = scenes[idx];
  const opacity = interpolate(localFrame, [0, 12, perScene - 12, perScene], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sp = spring({ frame: localFrame, fps, config: { damping: 18, stiffness: 100 } });
  const scale = interpolate(sp, [0, 1], [0.92, 1]);

  return (
    <AbsoluteFill style={{ background: s.bg, justifyContent: 'center', alignItems: 'center', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      <div style={{ opacity, transform: `scale(${scale})`, textAlign: 'center' }}>
        <div style={{ fontSize: 200, fontWeight: 800, color: s.color, letterSpacing: 4, textShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>{s.title}</div>
        <div style={{ fontSize: 96, fontWeight: 300, color: s.color, letterSpacing: 12, marginTop: 20, opacity: 0.7 }}>{s.sub}</div>
      </div>
    </AbsoluteFill>
  );
};

export default DemoTransitions;
