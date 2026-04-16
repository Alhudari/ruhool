// Demo: Research network — mint/lavender particles on light background
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

const nodes = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  const r = i % 2 === 0 ? 280 : 380;
  return {
    x: 540 + Math.cos(angle) * r,
    y: 960 + Math.sin(angle) * r,
    color: i % 3 === 0 ? '#b19cd9' : i % 3 === 1 ? '#a8e6cf' : '#a7c7e7',
    delay: i * 3,
  };
});

const DemoParticles: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const centerSp = spring({ frame, fps, config: { damping: 18, stiffness: 100 } });

  return (
    <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 50%,#fdfbf7 0%,#f5f0ea 100%)', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute' }}>
        {nodes.map((n, i) => {
          const sp = spring({ frame: frame - 20 - n.delay, fps, config: { damping: 18, stiffness: 100 } });
          const op = interpolate(sp, [0, 1], [0, 0.5]);
          return <line key={`l${i}`} x1={540} y1={960} x2={n.x} y2={n.y} stroke={n.color} strokeWidth={2} opacity={op} />;
        })}
        {nodes.map((n, i) => {
          const sp = spring({ frame: frame - n.delay, fps, config: { damping: 18, stiffness: 100 } });
          const r = interpolate(sp, [0, 1], [0, 22]);
          return <circle key={`n${i}`} cx={n.x} cy={n.y} r={r} fill={n.color} opacity={0.85} />;
        })}
        <circle cx={540} cy={960} r={interpolate(centerSp, [0, 1], [0, 40])} fill="#f5d491" />
      </svg>
      <div style={{ position: 'absolute', bottom: 200, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 64, fontWeight: 700, color: '#1a1a1a', letterSpacing: 6 }}>شبكة البحث</div>
      </div>
    </AbsoluteFill>
  );
};

export default DemoParticles;
