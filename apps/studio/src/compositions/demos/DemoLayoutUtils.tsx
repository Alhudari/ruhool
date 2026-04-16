// Demo: @remotion/layout-utils — measuring Arabic text precisely (isNew: true)
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { measureText } from '@remotion/layout-utils';

const WORD = 'الإبداع';
const FONT = 'IBM Plex Sans Arabic, Arial, sans-serif';

const DemoLayoutUtils: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const grow = spring({ frame, fps, config: { damping: 16, stiffness: 90 } });
  const fontSize = interpolate(grow, [0, 1], [40, 260], { extrapolateRight: 'clamp' });

  let m = { width: 400, height: 280 };
  try {
    m = measureText({ text: WORD, fontFamily: FONT, fontSize, fontWeight: '700', letterSpacing: '-2px' });
  } catch {}

  const boxOpacity = interpolate(frame, [20, 50], [0, 1], { extrapolateRight: 'clamp' });
  const labelOpacity = interpolate(frame, [60, 90], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(180deg, #fdfbf7 0%, #f7f3eb 100%)',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: FONT,
      }}
    >
      <div style={{ position: 'absolute', top: 140, letterSpacing: 6, fontSize: 20, color: '#8b7355', fontWeight: 300 }}>
        MEASURE • قياس
      </div>
      <div style={{ position: 'relative', padding: 40 }}>
        <div
          style={{
            position: 'absolute',
            left: 40 - 18,
            top: 40 - 18,
            width: m.width + 36,
            height: m.height + 36,
            border: '1.5px dashed #c9a87a',
            borderRadius: 8,
            opacity: boxOpacity,
          }}
        />
        <div
          style={{
            fontSize,
            fontWeight: 700,
            letterSpacing: '-2px',
            color: '#2d3748',
            lineHeight: 1,
            direction: 'rtl',
          }}
        >
          {WORD}
        </div>
        <div style={{ position: 'absolute', left: 40 - 70, top: 40 + m.height / 2 - 10, fontSize: 18, color: '#c9a87a', opacity: labelOpacity, fontVariantNumeric: 'tabular-nums' }}>
          ↕ {Math.round(m.height)}
        </div>
        <div style={{ position: 'absolute', left: 40 + m.width / 2 - 40, top: 40 + m.height + 22, fontSize: 18, color: '#c9a87a', opacity: labelOpacity, fontVariantNumeric: 'tabular-nums' }}>
          ↔ {Math.round(m.width)}
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 180, fontSize: 28, color: '#6b5d4a', fontWeight: 300, letterSpacing: 2 }}>
        قياس النص العربي بدقة
      </div>
    </AbsoluteFill>
  );
};

export default DemoLayoutUtils;
