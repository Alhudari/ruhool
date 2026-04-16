import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

// Demo: Realistic isometric skyscraper — pure SVG/CSS, no Three.js

const FLOORS = 11;
const COLS = 5;

const Demo3D: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 22, stiffness: 70 } });
  const tilt = interpolate(frame, [0, 210], [-2, 4]);
  const titleO = interpolate(frame, [40, 80], [0, 1], { extrapolateRight: 'clamp' });

  const floorH = 56;
  const baseW = 260;
  const cx = 540, groundY = 1420;

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg,#cfe4f5 0%,#eaf3fb 55%,#faf4e8 100%)', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      {/* Sun glow */}
      <div style={{ position: 'absolute', top: 180, left: 720, width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle,#fff7e0 0%,transparent 70%)' }} />

      <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="front" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#e8d9bd" /><stop offset="1" stopColor="#c9b38d" />
          </linearGradient>
          <linearGradient id="side" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#8a7758" /><stop offset="1" stopColor="#6b5a3f" />
          </linearGradient>
          <linearGradient id="roof" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#f3e6cc" /><stop offset="1" stopColor="#d4bf98" />
          </linearGradient>
          <radialGradient id="shadow"><stop offset="0" stopColor="#000" stopOpacity="0.35" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
        </defs>

        <g transform={`translate(${cx},${groundY}) rotate(${tilt}) translate(${-cx},${-groundY})`}>
          {/* Ground shadow */}
          <ellipse cx={cx} cy={groundY + 30} rx={260} ry={44} fill="url(#shadow)" />

          <g transform={`translate(0,${(1 - rise) * 200}) scale(1,${rise * 0.5 + 0.5})`} style={{ transformOrigin: `${cx}px ${groundY}px` }}>
            {/* Foundation base (isometric) */}
            <polygon points={`${cx - baseW - 20},${groundY} ${cx},${groundY + 40} ${cx + baseW + 20},${groundY} ${cx},${groundY - 40}`} fill="#7a6a4d" />
            <polygon points={`${cx - baseW - 20},${groundY} ${cx},${groundY + 40} ${cx},${groundY + 70} ${cx - baseW - 20},${groundY + 30}`} fill="#5c4e38" />
            <polygon points={`${cx + baseW + 20},${groundY} ${cx},${groundY + 40} ${cx},${groundY + 70} ${cx + baseW + 20},${groundY + 30}`} fill="#463b2b" />

            {/* Tower floors (stacked isometric). Draw top-down so lower floors overlay correctly */}
            {Array.from({ length: FLOORS }).map((_, i) => {
              const floor = FLOORS - 1 - i;
              const yTop = groundY - (floor + 1) * floorH;
              const yBot = groundY - floor * floorH;
              const w = baseW - floor * 4;
              const lx = cx - w, rx = cx + w;
              // Front face polygon (tilted isometric)
              const frontPts = `${lx},${yBot + 20} ${cx},${yBot + 40} ${cx},${yTop + 40} ${lx},${yTop + 20}`;
              const sidePts = `${cx},${yBot + 40} ${rx},${yBot + 20} ${rx},${yTop + 20} ${cx},${yTop + 40}`;
              return (
                <g key={floor}>
                  <polygon points={frontPts} fill="url(#front)" stroke="#a08a62" strokeWidth="0.5" />
                  <polygon points={sidePts} fill="url(#side)" stroke="#3e3426" strokeWidth="0.5" />
                  {/* Windows — front */}
                  {Array.from({ length: COLS }).map((_, c) => {
                    const t = c / COLS;
                    const wx = lx + (cx - lx) * (t + 0.1);
                    const wy = yTop + 20 + (yBot - yTop) * 0.25 + (yBot - yTop) * t * 0.015;
                    const litAt = 30 + (floor * COLS + c) * 3;
                    const lit = frame > litAt ? interpolate(frame, [litAt, litAt + 10], [0, 1], { extrapolateRight: 'clamp' }) : 0;
                    return <rect key={c} x={wx} y={wy} width={28} height={22} fill={`rgb(${255 * lit + 60},${240 * lit + 70},${180 * lit + 80})`} opacity={0.9} />;
                  })}
                  {/* Windows — side */}
                  {Array.from({ length: 3 }).map((_, c) => {
                    const t = c / 3;
                    const wx = cx + (rx - cx) * (t + 0.15);
                    const wy = yTop + 40 - (yTop - yBot) * 0.25 - t * 10;
                    const litAt = 40 + (floor * 3 + c) * 4;
                    const lit = frame > litAt ? interpolate(frame, [litAt, litAt + 10], [0, 1], { extrapolateRight: 'clamp' }) : 0;
                    return <rect key={c} x={wx} y={wy} width={22} height={20} fill={`rgb(${200 * lit + 40},${190 * lit + 50},${140 * lit + 60})`} opacity={0.85} />;
                  })}
                </g>
              );
            })}

            {/* Roof top */}
            {(() => {
              const yTop = groundY - FLOORS * floorH;
              const w = baseW - FLOORS * 4;
              return (
                <>
                  <polygon points={`${cx - w},${yTop + 20} ${cx},${yTop + 40} ${cx + w},${yTop + 20} ${cx},${yTop}`} fill="url(#roof)" stroke="#a08a62" />
                  {/* Water tank */}
                  <rect x={cx - 30} y={yTop - 40} width={60} height={40} fill="#b8a888" stroke="#6b5a3f" />
                  <polygon points={`${cx - 30},${yTop - 40} ${cx + 30},${yTop - 40} ${cx + 20},${yTop - 55} ${cx - 20},${yTop - 55}`} fill="#d4bf98" stroke="#6b5a3f" />
                  {/* Antenna */}
                  <line x1={cx} y1={yTop - 55} x2={cx} y2={yTop - 160} stroke="#2a2a2a" strokeWidth="3" />
                  <circle cx={cx} cy={yTop - 160} r="5" fill="#e8453c" opacity={0.6 + Math.sin(frame / 6) * 0.4} />
                </>
              );
            })()}
          </g>
        </g>
      </svg>

      <div style={{ position: 'absolute', bottom: 220, width: '100%', textAlign: 'center', opacity: titleO }}>
        <div style={{ fontSize: 76, fontWeight: 700, color: '#1e2a3a', letterSpacing: 4 }}>مبنى في الكويت</div>
        <div style={{ fontSize: 28, fontWeight: 300, color: '#5b6b7f', marginTop: 12, letterSpacing: 8 }}>عرض ثلاثي الأبعاد</div>
      </div>
    </AbsoluteFill>
  );
};

export default Demo3D;