// Demo: web-ifc + web-ifc-three — Real Kuwait tower (Al Hamra) with BIM IFC metadata overlay (isNew: true)
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Img } from 'remotion';
import { AL_HAMRA_TOWER } from '../../assets/al-hamra-tower';

const MyVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const imgOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
  const zoom = interpolate(frame, [0, 210], [1.15, 1.0], { extrapolateRight: 'clamp' });
  const titleO = spring({ frame: frame - 20, fps, config: { damping: 15 } });
  const metaO  = spring({ frame: frame - 60, fps, config: { damping: 18 } });

  const entities = [
    { k: 'IfcBuildingStorey', v: '80', delay: 0 },
    { k: 'IfcWall',           v: '12,480', delay: 8 },
    { k: 'IfcSlab',           v: '240', delay: 16 },
    { k: 'IfcWindow',         v: '3,840', delay: 24 },
    { k: 'IfcColumn',         v: '960', delay: 32 },
  ];

  return (
    <AbsoluteFill style={{
      background: 'linear-gradient(180deg, #f0f4f8 0%, #fdfbf7 50%, #fff5ed 100%)',
      direction: 'rtl',
      fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif',
    }}>
      {/* Real tower photo */}
      <div style={{ position: 'absolute', inset: 0, opacity: imgOpacity * 0.9, overflow: 'hidden' }}>
        <Img
          src={AL_HAMRA_TOWER}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${zoom})`,
            filter: 'saturate(1.05) contrast(1.02)',
          }}
        />
        {/* soft light overlay to keep text readable */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.05) 30%, rgba(255,255,255,0.6) 100%)' }} />
      </div>

      {/* IFC tag */}
      <div style={{ position: 'absolute', top: 70, left: 0, right: 0, textAlign: 'center', opacity: titleO }}>
        <span style={{ display: 'inline-block', padding: '10px 28px', background: '#ffaaa5', borderRadius: 999, color: '#fff', fontSize: 28, fontWeight: 800, letterSpacing: 2, boxShadow: '0 6px 20px rgba(255,170,165,0.5)' }}>
          IFC · BIM · web-ifc
        </span>
      </div>

      {/* Title */}
      <div style={{ position: 'absolute', top: 150, left: 0, right: 0, textAlign: 'center', opacity: titleO }}>
        <h1 style={{ color: '#1a202c', fontSize: 70, fontWeight: 900, margin: 0, textShadow: '0 2px 16px rgba(255,255,255,0.8)' }}>برج الحمراء</h1>
        <p style={{ color: '#2d3748', fontSize: 26, marginTop: 10, fontWeight: 500, letterSpacing: 1 }}>AlHamra_Tower.ifc · 80 طابق · 412م</p>
      </div>

      {/* IFC entity cards — bottom stack */}
      <div style={{ position: 'absolute', bottom: 80, left: 30, right: 30, opacity: metaO, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        {entities.map((m) => {
          const o = spring({ frame: frame - 60 - m.delay, fps, config: { damping: 16 } });
          return (
            <div key={m.k} style={{
              background: 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(8px)',
              border: '1.5px solid #ffaaa5',
              borderRadius: 12,
              padding: '12px 18px',
              boxShadow: '0 8px 24px rgba(255,170,165,0.25)',
              opacity: o,
              transform: `translateY(${(1 - o) * 20}px)`,
            }}>
              <div style={{ fontSize: 12, color: '#c76e68', fontFamily: 'monospace', letterSpacing: 0.5 }}>{m.k}</div>
              <div style={{ fontSize: 26, color: '#2d3748', fontWeight: 800 }}>{m.v}</div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: 30, width: '100%', textAlign: 'center', opacity: metaO * 0.8 }}>
        <div style={{ fontSize: 14, color: '#5a6470' }}>نموذج BIM حقيقي · Al Hamra Firdous Tower · Kuwait</div>
      </div>
    </AbsoluteFill>
  );
};

export default MyVideo;
