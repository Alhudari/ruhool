// Demo: Ruhool Platform Intro — 30s showcase using EVERY enabled capability (isNew: true)
// Sections: Logo reveal → Maps → BIM tower → Audio visualizer → Data charts → Final tag
import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Img } from 'remotion';
import { AL_HAMRA_TOWER } from '../../assets/al-hamra-tower';
import { KUWAIT_MAP_DATA } from '../../assets/kuwait-map-data';

const MAPBOX_TOKEN = '__MAPBOX_TOKEN__';
// Mapbox static max height is 1280px — request 720x1280 @2x (1440x2560 actual) and scale to fill
const mapbox = (zoom: number, style = 'dark-v11') =>
  `https://api.mapbox.com/styles/v1/mapbox/${style}/static/47.9774,29.3759,${zoom},0/720x1280@2x?access_token=${MAPBOX_TOKEN}`;

// ─── Scene 1: Logo reveal with particles (0-5s = frames 0-150) ───
const LogoScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoO = spring({ frame, fps, config: { damping: 14 } });
  const pulseScale = 1 + Math.sin(frame / 8) * 0.05;

  const particles = Array.from({ length: 30 }, (_, i) => {
    const angle = (i / 30) * Math.PI * 2;
    const dist = 150 + Math.sin((frame + i * 20) / 15) * 60;
    const x = 540 + Math.cos(angle + frame / 50) * dist;
    const y = 960 + Math.sin(angle + frame / 50) * dist;
    const hue = (i * 12 + frame) % 360;
    return { x, y, hue, size: 3 + (i % 4) };
  });

  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, #1a0b3a 0%, #050510 100%)', direction: 'rtl', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      {/* Particles */}
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        {particles.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={p.size} fill={`hsl(${p.hue}, 90%, 65%)`} opacity={0.7} style={{ filter: 'blur(0.5px)' }} />
        ))}
      </svg>

      {/* Central logo */}
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, transform: `translateY(-50%) scale(${logoO * pulseScale})`, textAlign: 'center', opacity: logoO }}>
        <div style={{ fontSize: 180, marginBottom: 20 }}>🐫</div>
        <h1 style={{ fontSize: 140, fontWeight: 900, margin: 0, background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 50%, #06b6d4 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: -4 }}>
          رحول
        </h1>
        <p style={{ fontSize: 28, color: 'rgba(255,255,255,0.8)', marginTop: 16, fontWeight: 300, letterSpacing: 6 }}>
          AI CREATIVE PLATFORM
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 2: Maps (5-11s = 180 frames) ───
const MapsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = spring({ frame, fps, config: { damping: 18 } });
  const zoom = interpolate(frame, [0, 180], [4, 11]);
  const layer1 = interpolate(frame, [0, 80, 120], [1, 1, 0], { extrapolateRight: 'clamp' });
  const layer2 = interpolate(frame, [80, 120, 180], [0, 1, 1], { extrapolateLeft: 'clamp' });

  if (!MAPBOX_TOKEN) {
    // Fallback to base64 Kuwait map
    return (
      <AbsoluteFill style={{ background: '#0a0e1a', direction: 'rtl', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: o }}>
          <Img src={KUWAIT_MAP_DATA} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ position: 'absolute', top: 100, width: '100%', textAlign: 'center', opacity: o }}>
          <h2 style={{ fontSize: 72, color: '#fff', fontWeight: 900 }}>خرائط حقيقية</h2>
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ background: '#000', direction: 'rtl', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: layer1 }}>
        <Img src={mapbox(Math.round(zoom))} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: layer2 }}>
        <Img src={mapbox(11, 'streets-v12')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,14,26,0.4) 0%, transparent 30%, transparent 70%, rgba(10,14,26,0.9) 100%)' }} />
      </div>
      <div style={{ position: 'absolute', top: 100, width: '100%', textAlign: 'center', opacity: o }}>
        <div style={{ display: 'inline-block', padding: '8px 20px', background: '#4264fb', borderRadius: 999, color: '#fff', fontSize: 18, fontWeight: 700, letterSpacing: 2 }}>MAPBOX · GEOAPIFY · LEAFLET</div>
        <h2 style={{ fontSize: 72, color: '#fff', fontWeight: 900, marginTop: 14, textShadow: '0 4px 20px #000' }}>خرائط حقيقية</h2>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 3: BIM Tower (11-17s = 180 frames) ───
const BIMScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const imgO = spring({ frame, fps, config: { damping: 18 } });
  const titleO = spring({ frame: frame - 15, fps, config: { damping: 16 } });
  const cardsO = spring({ frame: frame - 40, fps, config: { damping: 18 } });

  const entities = [
    { k: 'IfcWall', v: '12,480' }, { k: 'IfcSlab', v: '240' }, { k: 'IfcWindow', v: '3,840' },
  ];

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #f0f4f8 0%, #fff5ed 100%)', direction: 'rtl', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: imgO, overflow: 'hidden' }}>
        <Img src={AL_HAMRA_TOWER} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(1.1)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.3) 0%, transparent 30%, rgba(255,255,255,0.5) 100%)' }} />
      </div>
      <div style={{ position: 'absolute', top: 110, width: '100%', textAlign: 'center', opacity: titleO }}>
        <div style={{ display: 'inline-block', padding: '8px 24px', background: '#ffaaa5', borderRadius: 999, color: '#fff', fontSize: 20, fontWeight: 800, letterSpacing: 2 }}>IFC · BIM · web-ifc</div>
        <h2 style={{ fontSize: 80, color: '#1a202c', fontWeight: 900, marginTop: 14, textShadow: '0 2px 12px rgba(255,255,255,0.7)' }}>نماذج BIM حقيقية</h2>
      </div>
      <div style={{ position: 'absolute', bottom: 180, left: 30, right: 30, display: 'flex', gap: 10, justifyContent: 'center', opacity: cardsO }}>
        {entities.map((e) => (
          <div key={e.k} style={{ flex: 1, background: 'rgba(255,255,255,0.95)', border: '1.5px solid #ffaaa5', borderRadius: 12, padding: '14px', textAlign: 'center', boxShadow: '0 8px 20px rgba(255,170,165,0.3)' }}>
            <div style={{ fontSize: 11, color: '#c76e68', fontFamily: 'monospace', letterSpacing: 0.5 }}>{e.k}</div>
            <div style={{ fontSize: 28, color: '#2d3748', fontWeight: 900 }}>{e.v}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 4: Audio visualizer (17-23s = 180 frames) ───
const AudioScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = spring({ frame, fps, config: { damping: 14 } });

  const bars = Array.from({ length: 40 }, (_, i) => {
    const phase = (frame - i * 2) / 5;
    const h = 40 + Math.abs(Math.sin(phase)) * 180 + Math.abs(Math.sin(phase * 2)) * 70;
    const hue = 160 + Math.sin((frame + i * 5) / 30) * 40;
    return { h, hue };
  });

  const rings = [120, 180, 240];

  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, #0a1a2e 0%, #050015 100%)', direction: 'rtl', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0, opacity: o }}>
        {rings.map((r, i) => (
          <circle key={i} cx={540} cy={960} r={r + Math.sin((frame + i * 10) / 10) * 10} fill="none" stroke="#10b981" strokeWidth={1.5} opacity={0.4 - i * 0.1} strokeDasharray="4 8" />
        ))}
      </svg>
      <div style={{ position: 'absolute', top: 100, width: '100%', textAlign: 'center', opacity: o }}>
        <div style={{ display: 'inline-block', padding: '8px 24px', background: 'linear-gradient(90deg, #10b981, #06b6d4)', borderRadius: 999, color: '#fff', fontSize: 20, fontWeight: 800, letterSpacing: 2 }}>ELEVENLABS · STABLE AUDIO</div>
        <h2 style={{ fontSize: 80, color: '#fff', fontWeight: 900, marginTop: 14 }}>صوت AI عربي</h2>
      </div>
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, transform: 'translateY(-50%)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, opacity: o }}>
        {bars.map((b, i) => (
          <div key={i} style={{ width: 12, height: b.h, background: `linear-gradient(180deg, hsl(${b.hue}, 90%, 60%) 0%, hsl(${b.hue + 30}, 90%, 40%) 100%)`, borderRadius: 6, boxShadow: `0 0 12px hsl(${b.hue}, 90%, 60%, 0.6)` }} />
        ))}
      </div>
      <div style={{ position: 'absolute', bottom: 180, width: '100%', textAlign: 'center', opacity: o }}>
        <p style={{ fontSize: 32, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>تعليق عربي + موسيقى + مؤثرات</p>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 5: Data charts (23-27s = 120 frames) ───
const DataScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = spring({ frame, fps, config: { damping: 16 } });
  const barsReveal = interpolate(frame, [0, 80], [0, 1], { extrapolateRight: 'clamp' });

  const data = [
    { label: '٢٠٢٠', val: 32 }, { label: '٢٠٢٢', val: 52 },
    { label: '٢٠٢٤', val: 68 }, { label: '٢٠٢٦', val: 87 },
  ];
  const maxV = 100;
  const chartH = 600;

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #fdfbf7 0%, #fff5ed 100%)', direction: 'rtl', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      <div style={{ position: 'absolute', top: 120, width: '100%', textAlign: 'center', opacity: o }}>
        <div style={{ display: 'inline-block', padding: '8px 24px', background: '#ec4899', borderRadius: 999, color: '#fff', fontSize: 20, fontWeight: 800, letterSpacing: 2 }}>D3 · VISX · CHARTS</div>
        <h2 style={{ fontSize: 72, color: '#1a202c', fontWeight: 900, marginTop: 14 }}>بيانات تفاعلية</h2>
        <p style={{ fontSize: 22, color: '#6b6b6b', marginTop: 4 }}>تبني BIM في الكويت</p>
      </div>
      <div style={{ position: 'absolute', top: 500, left: 60, right: 60, height: chartH }}>
        <svg width="100%" height={chartH} viewBox="0 0 960 600">
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={60} y1={600 - (v / maxV) * 560} x2={920} y2={600 - (v / maxV) * 560} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="4 4" />
              <text x={50} y={600 - (v / maxV) * 560 + 5} fontSize={18} fill="#999" textAnchor="end">{v}%</text>
            </g>
          ))}
          {data.map((d, i) => {
            const barW = 160;
            const gap = 50;
            const x = 100 + i * (barW + gap);
            const barH = (d.val / maxV) * 560 * barsReveal;
            const y = 600 - barH;
            return (
              <g key={i}>
                <rect x={x} y={y} width={barW} height={barH} fill="url(#grad)" rx={12} />
                <text x={x + barW / 2} y={y - 15} fontSize={28} fill="#2d3748" fontWeight="900" textAnchor="middle">{d.val}%</text>
                <text x={x + barW / 2} y={640} fontSize={24} fill="#6b6b6b" textAnchor="middle" style={{ fontFamily: 'IBM Plex Sans Arabic' }}>{d.label}</text>
              </g>
            );
          })}
          <defs>
            <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 6: Final tag (27-30s = 90 frames) ───
const FinalScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = spring({ frame, fps, config: { damping: 14 } });
  const scale = spring({ frame, fps, config: { damping: 10, stiffness: 80 } });

  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, #3a0b4a 0%, #050510 100%)', direction: 'rtl', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', transform: `scale(${scale})`, opacity: o }}>
        <div style={{ fontSize: 120, marginBottom: 20 }}>✨</div>
        <h1 style={{ fontSize: 110, fontWeight: 900, margin: 0, background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 50%, #06b6d4 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          ابدع بلا حدود
        </h1>
        <p style={{ fontSize: 30, color: 'rgba(255,255,255,0.85)', marginTop: 30, fontWeight: 300, letterSpacing: 4 }}>
          رحول · المنصة الإبداعية بـ AI
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ─── Main composition ───
const MyVideo: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={0}   durationInFrames={150}><LogoScene /></Sequence>
    <Sequence from={150} durationInFrames={180}><MapsScene /></Sequence>
    <Sequence from={330} durationInFrames={180}><BIMScene /></Sequence>
    <Sequence from={510} durationInFrames={180}><AudioScene /></Sequence>
    <Sequence from={690} durationInFrames={120}><DataScene /></Sequence>
    <Sequence from={810} durationInFrames={90}><FinalScene /></Sequence>
  </AbsoluteFill>
);

export default MyVideo;
