// Demo: @remotion/skia — morphing gradient blob (SVG fallback for cross-platform) (isNew: true)
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

const blob = (t: number, cx: number, cy: number, r: number) => {
  const pts: string[] = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wob = Math.sin(t * 1.8 + i * 1.3) * 0.22 + Math.cos(t * 1.1 + i * 0.7) * 0.18;
    const rr = r * (1 + wob);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  // smooth closed cardinal-ish curve via Q segments
  let d = `M${pts[0]}`;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[(i + 1) % n].split(',').map(Number);
    const [x0, y0] = pts[i].split(',').map(Number);
    d += ` Q${x0},${y0} ${((x0 + x1) / 2).toFixed(1)},${((y0 + y1) / 2).toFixed(1)}`;
  }
  return d + ' Z';
};

const DemoSkia: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 18;
  const titleOp = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 30% 20%, #fdfbf7 0%, #f5f0f7 100%)', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      <svg width="100%" height="100%" viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id="g1" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#ffd3e0" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#d9c4f0" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#b8e4d0" stopOpacity="0.75" />
          </radialGradient>
          <radialGradient id="g2" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#ffe5d4" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#d9c4f0" stopOpacity="0.55" />
          </radialGradient>
          <filter id="blur1"><feGaussianBlur stdDeviation="12" /></filter>
        </defs>
        <path d={blob(t * 0.8 + 1.3, 540, 960, 420)} fill="url(#g2)" filter="url(#blur1)" opacity={0.85} />
        <path d={blob(t, 540, 960, 340)} fill="url(#g1)" />
        <path d={blob(t * 1.2 + 0.7, 540, 960, 220)} fill="#fff" opacity={0.55} />
      </svg>
      <div style={{ position: 'absolute', top: 180, width: '100%', textAlign: 'center', fontSize: 28, letterSpacing: 8, color: '#8a7aa6', fontWeight: 300, opacity: titleOp }}>
        S · K · I · A
      </div>
      <div style={{ position: 'absolute', bottom: 220, width: '100%', textAlign: 'center', fontSize: 56, color: '#3a2e4d', fontWeight: 700, opacity: titleOp }}>
        رسم بـ Skia
      </div>
      <div style={{ position: 'absolute', bottom: 160, width: '100%', textAlign: 'center', fontSize: 22, color: '#8a7aa6', fontWeight: 300, opacity: titleOp }}>
        أشكال سائلة بتدرّجات ناعمة
      </div>
    </AbsoluteFill>
  );
};

export default DemoSkia;
