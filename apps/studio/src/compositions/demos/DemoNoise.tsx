// Demo: Data flow — calm pastel dots drifting on cream
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

const DemoNoise: React.FC = () => {
  const frame = useCurrentFrame();
  const dots = Array.from({ length: 24 }, (_, i) => i);
  const titleY = interpolate(frame, [0, 30], [40, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleO = interpolate(frame, [0, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 40%,#fff 0%,#f5f0ea 100%)', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute' }}>
        {dots.map((i) => {
          const phase = i * 0.4;
          const t = (frame / 60) + phase;
          const x = 540 + Math.cos(t) * (180 + i * 8);
          const y = 960 + Math.sin(t * 0.8) * (240 + i * 6);
          const r = 14 + (i % 4) * 4;
          const colors = ['#b19cd9', '#a8e6cf', '#ffaaa5', '#a7c7e7'];
          return <circle key={i} cx={x} cy={y} r={r} fill={colors[i % 4]} opacity={0.55} />;
        })}
      </svg>
      <div style={{ position: 'absolute', top: 200, width: '100%', textAlign: 'center', transform: `translateY(${titleY}px)`, opacity: titleO }}>
        <div style={{ fontSize: 80, fontWeight: 700, color: '#1a1a1a', letterSpacing: 6 }}>تدفق البيانات</div>
        <div style={{ fontSize: 36, color: '#2d3748', letterSpacing: 8, marginTop: 20, opacity: 0.7 }}>data flow</div>
      </div>
    </AbsoluteFill>
  );
};

export default DemoNoise;
