// Demo: BIM adoption — animated pastel bars
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

const data = [
  { year: '2015', v: 22 },
  { year: '2018', v: 38 },
  { year: '2021', v: 58 },
  { year: '2024', v: 78 },
  { year: '2027', v: 92 },
];

const DemoCharts: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const maxH = 820;
  const titleO = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg,#fafaf7 0%,#fdfbf7 100%)', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif', padding: 80 }}>
      <div style={{ fontSize: 64, fontWeight: 700, color: '#1a1a1a', letterSpacing: 4, opacity: titleO, textAlign: 'center', marginTop: 60 }}>اعتماد BIM</div>
      <div style={{ fontSize: 32, color: '#2d3748', opacity: titleO * 0.7, textAlign: 'center', marginTop: 12, letterSpacing: 6 }}>BIM adoption %</div>
      <div style={{ display: 'flex', gap: 40, alignItems: 'flex-end', justifyContent: 'center', height: maxH, marginTop: 120 }}>
        {data.map((d, i) => {
          const sp = spring({ frame: frame - 20 - i * 7, fps, config: { damping: 20, stiffness: 90 } });
          const h = interpolate(sp, [0, 1], [0, (d.v / 100) * maxH]);
          const color = i % 2 === 0 ? '#a7c7e7' : '#ffd3b6';
          return (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, color: '#2d3748', marginBottom: 16, opacity: sp }}>{d.v}%</div>
              <div style={{ width: 130, height: h, background: color, borderRadius: '18px 18px 6px 6px', boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }} />
              <div style={{ fontSize: 32, color: '#1a1a1a', marginTop: 24, letterSpacing: 2 }}>{d.year}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export default DemoCharts;
