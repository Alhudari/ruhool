// Demo: Luma AI Genie — Photo to 3D teaser (isNew: true) — requires LUMA_KEY
// Note: actual 3D mesh generation is async (minutes). This demo shows the pipeline concept.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Img } from 'remotion';
import { AL_HAMRA_TOWER } from '../../assets/al-hamra-tower';

const KEY = '__LUMA_KEY__';

const MyVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const step1 = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: 'clamp' });
  const step2 = interpolate(frame, [60, 110], [0, 1], { extrapolateRight: 'clamp' });
  const step3 = interpolate(frame, [130, 180], [0, 1], { extrapolateRight: 'clamp' });
  const rotate = interpolate(frame, [130, 240], [0, 20], { extrapolateRight: 'clamp' });
  const scanY = interpolate(frame % 30, [0, 30], [0, 100]);
  const titleO = spring({ frame: frame - 10, fps, config: { damping: 18 } });

  if (!KEY) {
    return (
      <AbsoluteFill style={{ background: '#fdfbf7', direction: 'rtl', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 80 }}>🔑</div><h1 style={{ fontSize: 44, color: '#2d3748' }}>يحتاج مفتاح Luma AI</h1></div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #0a0515 0%, #2a0f4a 50%, #1a0530 100%)', direction: 'rtl', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      <div style={{ position: 'absolute', top: 80, width: '100%', textAlign: 'center', opacity: titleO }}>
        <div style={{ display: 'inline-block', padding: '10px 28px', background: 'linear-gradient(90deg, #ff6ec7, #7873f5)', borderRadius: 999, color: '#fff', fontSize: 22, fontWeight: 800, letterSpacing: 2 }}>LUMA AI · PHOTO → 3D</div>
        <h1 style={{ fontSize: 56, color: '#fff', fontWeight: 900, marginTop: 18 }}>صورة واحدة → نموذج 3D</h1>
      </div>

      {/* 3-step pipeline */}
      <div style={{ position: 'absolute', top: 340, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 20 }}>
        {/* Step 1: input photo */}
        <div style={{ width: 280, opacity: step1 }}>
          <div style={{ fontSize: 18, color: '#ff6ec7', marginBottom: 10, textAlign: 'center', fontWeight: 700 }}>1. الصورة</div>
          <div style={{ position: 'relative', width: 280, height: 380, borderRadius: 14, overflow: 'hidden', boxShadow: '0 10px 40px rgba(255,110,199,0.4)' }}>
            <Img src={AL_HAMRA_TOWER} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>

        {/* Step 2: processing with scan lines */}
        <div style={{ width: 280, opacity: step2 }}>
          <div style={{ fontSize: 18, color: '#7873f5', marginBottom: 10, textAlign: 'center', fontWeight: 700 }}>2. تحليل AI</div>
          <div style={{ position: 'relative', width: 280, height: 380, borderRadius: 14, overflow: 'hidden', background: '#0a0015', boxShadow: '0 10px 40px rgba(120,115,245,0.4)' }}>
            <Img src={AL_HAMRA_TOWER} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'hue-rotate(270deg) saturate(1.5) contrast(1.3)' }} />
            <div style={{ position: 'absolute', top: `${scanY}%`, left: 0, right: 0, height: 3, background: '#00ffcc', boxShadow: '0 0 20px #00ffcc' }} />
            {/* Wireframe overlay */}
            <svg width="280" height="380" style={{ position: 'absolute', inset: 0 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <line key={'h' + i} x1={0} y1={i * 50} x2={280} y2={i * 50} stroke="#00ffcc" strokeWidth={0.5} opacity={0.4} />
              ))}
              {Array.from({ length: 6 }).map((_, i) => (
                <line key={'v' + i} x1={i * 56} y1={0} x2={i * 56} y2={380} stroke="#00ffcc" strokeWidth={0.5} opacity={0.4} />
              ))}
            </svg>
          </div>
        </div>

        {/* Step 3: 3D mesh wireframe preview */}
        <div style={{ width: 280, opacity: step3 }}>
          <div style={{ fontSize: 18, color: '#00ffcc', marginBottom: 10, textAlign: 'center', fontWeight: 700 }}>3. نموذج 3D</div>
          <div style={{ position: 'relative', width: 280, height: 380, borderRadius: 14, overflow: 'hidden', background: '#050010', boxShadow: '0 10px 40px rgba(0,255,204,0.4)', perspective: '800px' }}>
            <svg width="280" height="380" viewBox="0 0 280 380" style={{ transform: `rotateY(${rotate}deg)` }}>
              {/* Wireframe tower */}
              {Array.from({ length: 20 }).map((_, i) => {
                const y = 40 + i * 16;
                const w = 80 + (19 - i) * 2;
                return (
                  <g key={i}>
                    <rect x={140 - w/2} y={y} width={w} height={12} fill="none" stroke="#00ffcc" strokeWidth={0.8} opacity={0.7} />
                  </g>
                );
              })}
              {/* Vertical edges */}
              <line x1={140 - 80/2} y1={40} x2={140 - 118/2} y2={360} stroke="#00ffcc" strokeWidth={1.5} />
              <line x1={140 + 80/2} y1={40} x2={140 + 118/2} y2={360} stroke="#00ffcc" strokeWidth={1.5} />
              <line x1={140} y1={20} x2={140 - 80/2} y2={40} stroke="#00ffcc" strokeWidth={1.5} />
              <line x1={140} y1={20} x2={140 + 80/2} y2={40} stroke="#00ffcc" strokeWidth={1.5} />
            </svg>
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 80, width: '100%', textAlign: 'center', opacity: step3 }}>
        <p style={{ fontSize: 24, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>جاهز للتحريك في أي محرك 3D</p>
      </div>
    </AbsoluteFill>
  );
};

export default MyVideo;
