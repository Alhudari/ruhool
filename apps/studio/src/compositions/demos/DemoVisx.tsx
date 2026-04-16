// Demo: @visx/visx — Advanced chart visualization (pure SVG fallback) (isNew: true)
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

const MyVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const data = [
    { year: '2018', v: 12 },
    { year: '2020', v: 24 },
    { year: '2022', v: 38 },
    { year: '2024', v: 52 },
    { year: '2026', v: 68 },
  ];

  const W = 720, H = 420;
  const pad = { t: 40, r: 50, b: 60, l: 70 };
  const chartW = W - pad.l - pad.r;
  const chartH = H - pad.t - pad.b;
  const maxV = 80;

  const progress = spring({ frame, fps, config: { damping: 22, stiffness: 70 } });

  const points = data.map((d, i) => {
    const x = pad.l + (i / (data.length - 1)) * chartW;
    const y = pad.t + chartH - (d.v / maxV) * chartH;
    return { x, y, d };
  });

  const visibleCount = progress * points.length;
  const pathD = points.map((p, i) => {
    if (i > visibleCount) return '';
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = points[i - 1];
    const t = Math.min(1, visibleCount - i + 1);
    const endX = prev.x + (p.x - prev.x) * t;
    const endY = prev.y + (p.y - prev.y) * t;
    return `L ${endX} ${endY}`;
  }).join(' ');

  const lastVisible = points[Math.min(points.length - 1, Math.floor(visibleCount))];
  const areaD = pathD ? `${pathD} L ${lastVisible.x} ${pad.t + chartH} L ${pad.l} ${pad.t + chartH} Z` : '';

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const latestIdx = Math.min(points.length - 1, Math.floor(visibleCount));
  const latest = points[latestIdx];

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #fdfbf7 0%, #fff5ed 100%)', direction: 'rtl', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      <div style={{ position: 'absolute', top: 100, left: 0, right: 0, textAlign: 'center', opacity: titleOpacity }}>
        <p style={{ color: '#ffaaa5', fontSize: 22, fontWeight: 700, letterSpacing: 2, margin: 0 }}>@visx/visx</p>
        <h1 style={{ color: '#2d3748', fontSize: 52, fontWeight: 800, marginTop: 12 }}>تبني BIM</h1>
        <p style={{ color: '#6b6b6b', fontSize: 22, marginTop: 8, fontWeight: 400 }}>نسبة الانتشار في الكويت</p>
      </div>

      <div style={{ position: 'absolute', top: 420, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <svg width={W} height={H}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffaaa5" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#ffaaa5" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          {[0, 20, 40, 60, 80].map((v) => (
            <g key={v}>
              <line x1={pad.l} y1={pad.t + chartH - (v / maxV) * chartH} x2={W - pad.r} y2={pad.t + chartH - (v / maxV) * chartH} stroke="#e0e0e0" strokeWidth={1} strokeDasharray="4 4" />
              <text x={pad.l - 12} y={pad.t + chartH - (v / maxV) * chartH + 5} fontSize={14} fill="#999" textAnchor="end">{v}%</text>
            </g>
          ))}

          {areaD && <path d={areaD} fill="url(#areaGrad)" />}
          {pathD && <path d={pathD} fill="none" stroke="#ffaaa5" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />}

          {points.map((p, i) => i < visibleCount && (
            <circle key={i} cx={p.x} cy={p.y} r={6} fill="#fff" stroke="#ffaaa5" strokeWidth={3} />
          ))}

          {points.map((p, i) => (
            <text key={i} x={p.x} y={pad.t + chartH + 28} fontSize={16} fill="#666" textAnchor="middle">{p.d.year}</text>
          ))}

          {latest && visibleCount > 0.5 && (
            <g transform={`translate(${latest.x - 40}, ${latest.y - 50})`}>
              <rect width={80} height={34} rx={6} fill="#2d3748" />
              <text x={40} y={22} fontSize={18} fill="#fff" textAnchor="middle" fontWeight={700}>{latest.d.v}%</text>
            </g>
          )}
        </svg>
      </div>
    </AbsoluteFill>
  );
};

export default MyVideo;
