// Demo: Geoapify — Data-driven heatmap overlay with animated markers (isNew: true)
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Img } from 'remotion';

const KEY = '__GEOAPIFY_KEY__';
const MAP_URL = `https://maps.geoapify.com/v1/staticmap?style=positron&width=1080&height=1500&center=lonlat:47.9774,29.3375&zoom=8.5&apiKey=${KEY}`;

// BIM adoption data points across Kuwait (lon/lat pseudo-mapped to pixel coords)
const DATA_POINTS = [
  { x: 560, y: 620, intensity: 0.95, label: 'مدينة الكويت', value: '87%' },
  { x: 590, y: 700, intensity: 0.75, label: 'السالمية',   value: '72%' },
  { x: 540, y: 740, intensity: 0.60, label: 'الفروانية',  value: '58%' },
  { x: 530, y: 900, intensity: 0.80, label: 'الأحمدي',    value: '78%' },
  { x: 400, y: 500, intensity: 0.35, label: 'الجهراء',    value: '32%' },
];

const MyVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!KEY) {
    return (
      <AbsoluteFill style={{ background: '#fdfbf7', alignItems: 'center', justifyContent: 'center', fontFamily: 'IBM Plex Sans Arabic' }}>
        <div style={{ fontSize: 80 }}>🔑</div>
        <h1 style={{ fontSize: 44 }}>يحتاج مفتاح Geoapify</h1>
      </AbsoluteFill>
    );
  }

  const mapO = spring({ frame, fps, config: { damping: 18 } });
  const titleO = spring({ frame: frame - 25, fps, config: { damping: 15 } });
  const legendO = spring({ frame: frame - 150, fps, config: { damping: 18 } });

  // Heatmap pulse
  const pulse = (i: number) => {
    const p = Math.sin((frame - i * 8) / 10);
    return 1 + p * 0.15;
  };

  const markerReveal = (i: number) => spring({ frame: frame - 60 - i * 12, fps, config: { damping: 14 } });

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #e8f4f8 0%, #fff8f0 100%)', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif', direction: 'rtl' }}>
      {/* Background map */}
      <div style={{ position: 'absolute', top: 180, left: 0, right: 0, height: 1500, opacity: mapO * 0.9, overflow: 'hidden' }}>
        <Img src={MAP_URL} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

        {/* Data overlay SVG */}
        <svg width="1080" height="1500" style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <radialGradient id="heatHot">
              <stop offset="0%" stopColor="#ff3366" stopOpacity={0.8} />
              <stop offset="50%" stopColor="#ff6b35" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#ff6b35" stopOpacity={0} />
            </radialGradient>
            <radialGradient id="heatMid">
              <stop offset="0%" stopColor="#ffb627" stopOpacity={0.7} />
              <stop offset="100%" stopColor="#ffb627" stopOpacity={0} />
            </radialGradient>
            <radialGradient id="heatCold">
              <stop offset="0%" stopColor="#00a86b" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#00a86b" stopOpacity={0} />
            </radialGradient>
          </defs>

          {/* Heat blobs */}
          {DATA_POINTS.map((p, i) => {
            const r = 120 * pulse(i) * markerReveal(i);
            const grad = p.intensity > 0.7 ? 'heatHot' : p.intensity > 0.45 ? 'heatMid' : 'heatCold';
            return <circle key={'h' + i} cx={p.x} cy={p.y} r={r} fill={`url(#${grad})`} />;
          })}

          {/* Markers */}
          {DATA_POINTS.map((p, i) => {
            const rev = markerReveal(i);
            const color = p.intensity > 0.7 ? '#ff3366' : p.intensity > 0.45 ? '#ffb627' : '#00a86b';
            return (
              <g key={'m' + i} transform={`translate(${p.x}, ${p.y})`} opacity={rev}>
                <circle r={18 * pulse(i)} fill={color} opacity={0.25} />
                <circle r={10} fill="#fff" stroke={color} strokeWidth={3} />
                <circle r={4} fill={color} />
                {/* Label card */}
                <g transform={`translate(18, -6)`}>
                  <rect x={-2} y={-24} width={160} height={54} rx={8} fill="#fff" stroke={color} strokeWidth={1.5} filter="drop-shadow(0 4px 12px rgba(0,0,0,0.15))" />
                  <text x={10} y={-6} fontSize={16} fontWeight={700} fill="#2d3748" style={{ fontFamily: 'IBM Plex Sans Arabic' }}>{p.label}</text>
                  <text x={10} y={18} fontSize={20} fontWeight={900} fill={color}>{p.value}</text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Top title */}
      <div style={{ position: 'absolute', top: 50, left: 0, right: 0, textAlign: 'center', opacity: titleO }}>
        <div style={{ display: 'inline-block', padding: '8px 24px', background: '#00a86b', borderRadius: 999, color: '#fff', fontSize: 18, fontWeight: 800, letterSpacing: 3 }}>
          GEOAPIFY · POSITRON
        </div>
        <h1 style={{ fontSize: 56, color: '#1a202c', fontWeight: 900, marginTop: 16 }}>
          تبنّي BIM في الكويت
        </h1>
        <p style={{ fontSize: 20, color: '#4a5568', marginTop: 4, fontWeight: 400 }}>
          خريطة حرارية للمحافظات · 2026
        </p>
      </div>

      {/* Legend */}
      <div style={{ position: 'absolute', bottom: 60, left: 40, right: 40, padding: '16px 24px', background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', opacity: legendO }}>
        <div style={{ fontSize: 13, color: '#718096', fontWeight: 700, letterSpacing: 2, marginBottom: 10 }}>مفتاح الخريطة</div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { c: '#ff3366', l: 'عالي (>70%)' },
            { c: '#ffb627', l: 'متوسط (45-70%)' },
            { c: '#00a86b', l: 'منخفض (<45%)' },
          ].map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: l.c, boxShadow: `0 0 12px ${l.c}80` }} />
              <span style={{ fontSize: 16, color: '#2d3748', fontWeight: 500 }}>{l.l}</span>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default MyVideo;
