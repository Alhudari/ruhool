import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Img } from 'remotion';

// Demo: MapTiler static maps — Satellite view of Kuwait (isNew: true) — requires MAPTILER_KEY

const KEY = 'GczADOhyeiQXTqiNBbWB';
const MAP_URL = `https://api.maptiler.com/maps/hybrid/static/47.9774,29.3759,9.5/720x900@2x.jpg?key=${KEY}`;

const MyVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleO = spring({ frame, fps, config: { damping: 18 } });
  const mapO = spring({ frame: frame - 8, fps, config: { damping: 14 } });
  const zoom = interpolate(frame, [0, 210], [1.08, 1.0], { extrapolateRight: 'clamp' });

  if (!KEY) {
    return (
      <AbsoluteFill style={{ background: '#fdfbf7', direction: 'rtl', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 80 }}>🔑</div><h1 style={{ fontSize: 44, color: '#2d3748' }}>يحتاج مفتاح MapTiler</h1></div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ background: '#1a1e2e', direction: 'rtl', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: mapO, overflow: 'hidden' }}>
        <Img src={MAP_URL} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} />
      </div>
      <div style={{ position: 'absolute', top: 100, width: '100%', textAlign: 'center', opacity: titleO }}>
        <div style={{ display: 'inline-block', padding: '8px 24px', background: 'rgba(255,255,255,0.95)', borderRadius: 999, color: '#006eb7', fontSize: 20, fontWeight: 700, letterSpacing: 2 }}>MAPTILER · SATELLITE</div>
        <h1 style={{ fontSize: 64, color: '#fff', fontWeight: 900, marginTop: 16, textShadow: '0 4px 20px rgba(0,0,0,0.9)' }}>الكويت من الفضاء</h1>
        <p style={{ fontSize: 22, color: 'rgba(255,255,255,0.9)', marginTop: 10, textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>Satellite + Hybrid tiles</p>
      </div>
    </AbsoluteFill>
  );
};

export default MyVideo;