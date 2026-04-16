// Demo: Waveform — sky blue bars on white
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

const bars = Array.from({ length: 40 }, (_, i) => i);

const DemoMediaUtils: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleO = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg,#fff 0%,#fafaf7 100%)', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ fontSize: 64, fontWeight: 700, color: '#1a1a1a', letterSpacing: 6, opacity: titleO, marginBottom: 80 }}>الموجة الصوتية</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', height: 500 }}>
        {bars.map((i) => {
          const sp = spring({ frame: frame - 10 - i * 2, fps, config: { damping: 15, stiffness: 110 } });
          const base = 0.3 + 0.5 * Math.abs(Math.sin((i + 1) * 1.3));
          const pulse = 0.85 + 0.15 * Math.sin(frame / 18 + i * 0.4);
          const h = interpolate(sp, [0, 1], [10, 500 * base * pulse]);
          const color = i % 3 === 0 ? '#a7c7e7' : '#b4d4ec';
          return <div key={i} style={{ width: 14, height: h, background: color, borderRadius: 8, boxShadow: '0 2px 10px rgba(167,199,231,0.3)' }} />;
        })}
      </div>
      <div style={{ fontSize: 32, color: '#2d3748', letterSpacing: 8, opacity: titleO * 0.7, marginTop: 80 }}>audio waveform</div>
    </AbsoluteFill>
  );
};

export default DemoMediaUtils;
