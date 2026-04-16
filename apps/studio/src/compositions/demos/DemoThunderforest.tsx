// Demo: Thunderforest — Topographic Kuwait with altitude profile + data layers (isNew: true)
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Img } from 'remotion';

const KEY = '__THUNDERFOREST_KEY__';
// Stitch a 2x2 tile grid of landscape tiles centered on Kuwait (zoom 7-8)
// Tiles at zoom 7: Kuwait is at tile (80, 53)-(81, 54) approximately
const TILES = [
  { x: 80, y: 53 }, { x: 81, y: 53 },
  { x: 80, y: 54 }, { x: 81, y: 54 },
];
const tileUrl = (tx: number, ty: number) => `https://tile.thunderforest.com/landscape/7/${tx}/${ty}.png?apikey=${KEY}`;

// Elevation samples across the "transect" — pretend profile
const ELEVATION_PROFILE = [
  { x: 0.05, elev: 5 }, { x: 0.15, elev: 18 }, { x: 0.25, elev: 42 },
  { x: 0.35, elev: 78 }, { x: 0.45, elev: 120 }, { x: 0.55, elev: 180 },
  { x: 0.65, elev: 250 }, { x: 0.75, elev: 310 }, { x: 0.85, elev: 180 }, { x: 0.95, elev: 90 },
];

const MyVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!KEY) {
    return (
      <AbsoluteFill style={{ background: '#fdfbf7', alignItems: 'center', justifyContent: 'center', fontFamily: 'IBM Plex Sans Arabic' }}>
        <div style={{ fontSize: 80 }}>🔑</div><h1 style={{ fontSize: 44 }}>يحتاج Thunderforest</h1>
      </AbsoluteFill>
    );
  }

  const tilesO = spring({ frame, fps, config: { damping: 14 } });
  const titleO = spring({ frame: frame - 30, fps, config: { damping: 15 } });
  const profileReveal = interpolate(frame, [60, 180], [0, 1], { extrapolateRight: 'clamp' });
  const lineLength = profileReveal;

  // Build elevation path
  const profileH = 180;
  const profileW = 1000;
  const profilePath = ELEVATION_PROFILE.map((p, i) => {
    const px = p.x * profileW;
    const py = profileH - (p.elev / 320) * profileH;
    return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
  }).join(' ');
  const profileArea = `${profilePath} L ${profileW} ${profileH} L 0 ${profileH} Z`;

  // Animated marker on profile
  const markerX = profileReveal * profileW;
  const markerIdx = Math.min(ELEVATION_PROFILE.length - 1, Math.floor(markerX / profileW * ELEVATION_PROFILE.length));
  const markerElev = ELEVATION_PROFILE[markerIdx]?.elev || 0;

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #d8e5c5 0%, #f0e9d8 100%)', direction: 'rtl', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      {/* Topographic map as 2x2 tile grid */}
      <div style={{ position: 'absolute', top: 320, left: 30, right: 30, height: 1000, opacity: tilesO, overflow: 'hidden', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', width: '100%', height: '100%' }}>
          {TILES.map((t, i) => (
            <Img key={i} src={tileUrl(t.x, t.y)} style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'crisp-edges' }} />
          ))}
        </div>
        {/* Transect line (animated) */}
        <svg width="100%" height="100%" viewBox="0 0 1020 1000" style={{ position: 'absolute', inset: 0 }}>
          <line x1={60} y1={500} x2={60 + (1020 - 120) * lineLength} y2={500} stroke="#c2410c" strokeWidth={4} strokeLinecap="round" strokeDasharray="8 6" />
          <circle cx={60 + (1020 - 120) * lineLength} cy={500} r={12} fill="#fbbf24" stroke="#c2410c" strokeWidth={3} />
          <circle cx={60} cy={500} r={8} fill="#c2410c" />
        </svg>
      </div>

      {/* Top badge */}
      <div style={{ position: 'absolute', top: 80, left: 0, right: 0, textAlign: 'center', opacity: titleO }}>
        <div style={{ display: 'inline-block', padding: '10px 28px', background: '#7aa67a', borderRadius: 999, color: '#fff', fontSize: 22, fontWeight: 800, letterSpacing: 3, boxShadow: '0 8px 24px rgba(122,166,122,0.5)' }}>
          THUNDERFOREST · LANDSCAPE
        </div>
        <h1 style={{ fontSize: 64, color: '#2d4a2d', fontWeight: 900, marginTop: 16, textShadow: '0 2px 8px rgba(255,255,255,0.5)' }}>
          خريطة طبوغرافية
        </h1>
        <p style={{ fontSize: 22, color: '#5a6e5a', marginTop: 4 }}>
          مقطع ارتفاعي عبر الكويت
        </p>
      </div>

      {/* Elevation profile at bottom */}
      <div style={{ position: 'absolute', bottom: 80, left: 40, right: 40, padding: 20, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', borderRadius: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.15)', opacity: profileReveal }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 14, color: '#7aa67a', fontWeight: 700, letterSpacing: 2 }}>ELEVATION PROFILE</div>
            <div style={{ fontSize: 18, color: '#2d4a2d', fontWeight: 700 }}>الارتفاع عبر المقطع</div>
          </div>
          <div style={{ textAlign: 'end' }}>
            <div style={{ fontSize: 14, color: '#718096' }}>الارتفاع الحالي</div>
            <div style={{ fontSize: 30, color: '#c2410c', fontWeight: 900 }}>{Math.round(markerElev)} م</div>
          </div>
        </div>
        <svg width="100%" height={profileH} viewBox={`0 0 ${profileW} ${profileH}`}>
          <defs>
            <linearGradient id="elev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c2410c" stopOpacity={0.7} />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          {/* Grid */}
          {[0, 100, 200, 300].map((v, i) => (
            <line key={i} x1={0} x2={profileW} y1={profileH - (v / 320) * profileH} y2={profileH - (v / 320) * profileH} stroke="#e2e8f0" strokeWidth={1} />
          ))}
          <path d={profileArea} fill="url(#elev)" style={{ clipPath: `polygon(0 0, ${profileReveal * 100}% 0, ${profileReveal * 100}% 100%, 0 100%)` }} />
          <path d={profilePath} fill="none" stroke="#c2410c" strokeWidth={3} style={{ strokeDasharray: 2000, strokeDashoffset: 2000 * (1 - profileReveal) }} />
          {/* Moving marker */}
          {profileReveal > 0.02 && (
            <g transform={`translate(${markerX}, ${profileH - (markerElev / 320) * profileH})`}>
              <circle r={8} fill="#c2410c" />
              <circle r={14} fill="none" stroke="#c2410c" strokeWidth={2} opacity={0.5} />
            </g>
          )}
        </svg>
      </div>
    </AbsoluteFill>
  );
};

export default MyVideo;
