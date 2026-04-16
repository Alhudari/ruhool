// Demo: Mapbox Static — Cinematic zoom from space to Kuwait City with parallax tags (isNew: true)
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Img, Sequence } from 'remotion';

const TOKEN = '__MAPBOX_TOKEN__';
const KW_LAT = 29.3759, KW_LON = 47.9774;
const styleDark = 'dark-v11';
const styleStreets = 'streets-v12';

// 3 zoom levels for parallax cinematic zoom-in
const zooms = [4, 7, 11];
const makeUrl = (zoom: number, style: string) =>
  `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${KW_LON},${KW_LAT},${zoom},0/1080x1920@2x?access_token=${TOKEN}`;

const STATS = [
  { ar: 'المساحة', en: 'AREA', value: '17,818', unit: 'km²' },
  { ar: 'السكان', en: 'POPULATION', value: '4.3M', unit: '' },
  { ar: 'المحافظات', en: 'GOVERNORATES', value: '6', unit: '' },
  { ar: 'الساحل', en: 'COASTLINE', value: '499', unit: 'km' },
];

const MyVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  if (!TOKEN) {
    return (
      <AbsoluteFill style={{ background: '#0a0e1a', color: '#fff', alignItems: 'center', justifyContent: 'center', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif', direction: 'rtl' }}>
        <div style={{ fontSize: 80 }}>🔑</div>
        <h1 style={{ fontSize: 48 }}>أضف مفتاح Mapbox</h1>
      </AbsoluteFill>
    );
  }

  // Layer crossfades for zoom sequence
  const t = frame / durationInFrames;
  const layer0Opacity = interpolate(t, [0, 0.25, 0.35], [1, 1, 0], { extrapolateRight: 'clamp' });
  const layer1Opacity = interpolate(t, [0.2, 0.35, 0.55, 0.65], [0, 1, 1, 0], { extrapolateRight: 'clamp' });
  const layer2Opacity = interpolate(t, [0.55, 0.7, 1], [0, 1, 1], { extrapolateLeft: 'clamp' });

  // Continuous slow zoom within each layer
  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.25], { extrapolateRight: 'clamp' });

  // Titles
  const titleSlide = spring({ frame: frame - 20, fps, config: { damping: 18, stiffness: 80 } });
  const subtitleSlide = spring({ frame: frame - 45, fps, config: { damping: 18, stiffness: 80 } });

  // Stats wave-in
  const statsReveal = (i: number) => spring({ frame: frame - 90 - i * 12, fps, config: { damping: 16 } });

  return (
    <AbsoluteFill style={{ background: '#000', direction: 'rtl', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      {/* Zoom layers */}
      <div style={{ position: 'absolute', inset: 0, opacity: layer0Opacity, transform: `scale(${scale})` }}>
        <Img src={makeUrl(zooms[0], styleDark)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(1.1) brightness(0.9)' }} />
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: layer1Opacity, transform: `scale(${scale})` }}>
        <Img src={makeUrl(zooms[1], styleDark)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(1.15)' }} />
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: layer2Opacity, transform: `scale(${scale})` }}>
        <Img src={makeUrl(zooms[2], styleStreets)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,14,26,0.5) 0%, transparent 25%, transparent 65%, rgba(10,14,26,0.95) 100%)' }} />
      </div>

      {/* Crosshair target at center (appears during layer transitions) */}
      {frame < durationInFrames * 0.7 && (
        <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width="1080" height="1920">
          <g transform="translate(540, 960)" opacity={0.8}>
            <circle r={60} fill="none" stroke="#4264fb" strokeWidth={2} strokeDasharray="6 4" style={{ transformOrigin: 'center', animation: 'spin 8s linear infinite' }} />
            <circle r={30} fill="none" stroke="#4264fb" strokeWidth={1.5} />
            <line x1={-80} y1={0} x2={-40} y2={0} stroke="#4264fb" strokeWidth={2} />
            <line x1={40} y1={0} x2={80} y2={0} stroke="#4264fb" strokeWidth={2} />
            <line x1={0} y1={-80} x2={0} y2={-40} stroke="#4264fb" strokeWidth={2} />
            <line x1={0} y1={40} x2={0} y2={80} stroke="#4264fb" strokeWidth={2} />
            <circle r={4} fill="#4264fb" />
          </g>
        </svg>
      )}

      {/* Top tag */}
      <div style={{ position: 'absolute', top: 80, left: 0, right: 0, textAlign: 'center', transform: `translateY(${(1 - titleSlide) * -30}px)`, opacity: titleSlide }}>
        <div style={{ display: 'inline-block', padding: '10px 28px', background: 'rgba(66, 100, 251, 0.95)', borderRadius: 999, color: '#fff', fontSize: 22, fontWeight: 800, letterSpacing: 3, boxShadow: '0 8px 30px rgba(66,100,251,0.5)' }}>
          MAPBOX · SATELLITE CINEMATIC
        </div>
      </div>

      {/* Main title */}
      <div style={{ position: 'absolute', top: 160, left: 0, right: 0, textAlign: 'center', transform: `translateY(${(1 - titleSlide) * -50}px)`, opacity: titleSlide }}>
        <h1 style={{ fontSize: 96, color: '#fff', fontWeight: 900, margin: 0, textShadow: '0 6px 40px rgba(0,0,0,0.9)', letterSpacing: -2 }}>
          دولة الكويت
        </h1>
        <p style={{ fontSize: 26, color: 'rgba(255,255,255,0.85)', marginTop: 12, fontWeight: 300, letterSpacing: 4, textShadow: '0 2px 10px rgba(0,0,0,0.8)', opacity: subtitleSlide }}>
          STATE OF KUWAIT · 29.3759°N 47.9774°E
        </p>
      </div>

      {/* Stats grid at bottom */}
      <div style={{ position: 'absolute', bottom: 100, left: 40, right: 40, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {STATS.map((s, i) => {
          const r = statsReveal(i);
          return (
            <div key={i} style={{
              padding: '18px 22px',
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(14px)',
              border: '1px solid rgba(66,100,251,0.4)',
              borderRadius: 14,
              opacity: r,
              transform: `translateY(${(1 - r) * 30}px)`,
            }}>
              <div style={{ fontSize: 12, color: '#7ea0ff', letterSpacing: 2, fontWeight: 700 }}>{s.en}</div>
              <div style={{ fontSize: 42, color: '#fff', fontWeight: 900, marginTop: 4 }}>{s.value} <span style={{ fontSize: 20, color: 'rgba(255,255,255,0.7)', fontWeight: 400 }}>{s.unit}</span></div>
              <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>{s.ar}</div>
            </div>
          );
        })}
      </div>

      {/* Scanline for sci-fi effect */}
      <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, rgba(66,100,251,0.03) 0px, transparent 2px, transparent 4px)', pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};

export default MyVideo;
