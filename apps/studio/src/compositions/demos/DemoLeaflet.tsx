// Demo: leaflet + OpenStreetMap — Real Kuwait map with live map tiles (isNew: true)
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Img } from 'remotion';
import { KUWAIT_MAP_DATA } from '../../assets/kuwait-map-data';

// Inline base64 Wikimedia/OSM static map of Kuwait (render-safe, no network)
const MAP_URL = KUWAIT_MAP_DATA;

// City pin positions calibrated to the static map above (x,y in the 720x900 image space)
const CITIES = [
  { name: 'مدينة الكويت', x: 470, y: 400, pop: '2.8M' },
  { name: 'حولي',         x: 485, y: 440, pop: '164K' },
  { name: 'الفروانية',    x: 440, y: 450, pop: '81K' },
  { name: 'الأحمدي',      x: 445, y: 540, pop: '42K' },
  { name: 'الجهراء',      x: 350, y: 350, pop: '51K' },
];

const MyVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleO = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: 'clamp' });
  const mapO   = interpolate(frame, [10, 45], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{
      background: 'linear-gradient(180deg, #fdfbf7 0%, #fff5ed 100%)',
      direction: 'rtl',
      fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif',
    }}>
      {/* Header */}
      <div style={{ position: 'absolute', top: 80, width: '100%', textAlign: 'center', opacity: titleO }}>
        <div style={{ fontSize: 22, letterSpacing: 6, color: '#ffaaa5', fontWeight: 700 }}>OPENSTREETMAP · LEAFLET</div>
        <div style={{ fontSize: 64, color: '#2d3748', fontWeight: 800, marginTop: 14 }}>دولة الكويت</div>
        <div style={{ fontSize: 22, color: '#6b6b6b', marginTop: 8, fontWeight: 400 }}>المدن الرئيسية على خريطة حقيقية</div>
      </div>

      {/* Real map + pins overlay */}
      <div style={{ position: 'absolute', top: 320, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 720, height: 900, opacity: mapO, borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
          <Img src={MAP_URL} style={{ width: 720, height: 900, objectFit: 'cover' }} />

          {/* Pin overlay */}
          <svg width={720} height={900} style={{ position: 'absolute', inset: 0 }}>
            {CITIES.map((c, i) => {
              const s = spring({ frame: frame - 45 - i * 10, fps, config: { damping: 12 } });
              const pulse = 1 + Math.sin((frame - i * 12) / 8) * 0.35;
              const labelRight = c.x < 360;
              return (
                <g key={i} transform={`translate(${c.x},${c.y})`} opacity={s}>
                  <circle r={26 * pulse} fill="#ffaaa5" opacity={0.25} />
                  <circle r={14} fill="#ffaaa5" opacity={0.5} />
                  <circle r={7} fill="#e8453c" stroke="#fff" strokeWidth={2.5} />
                  <g transform={`translate(${labelRight ? 16 : -16},-4)`}>
                    <rect x={labelRight ? 0 : -140} y={-16} width={140} height={32} rx={8} fill="#fff" stroke="#ffaaa5" strokeWidth={1.5} />
                    <text x={labelRight ? 70 : -70} y={6} textAnchor="middle" fontSize={16} fontWeight={700} fill="#2d3748" style={{ fontFamily: 'IBM Plex Sans Arabic' }}>{c.name}</text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Attribution */}
      <div style={{ position: 'absolute', bottom: 30, width: '100%', textAlign: 'center', opacity: mapO * 0.8 }}>
        <div style={{ fontSize: 14, color: '#9b9b9b' }}>© OpenStreetMap contributors</div>
      </div>
    </AbsoluteFill>
  );
};

export default MyVideo;
