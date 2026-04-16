// Demo: "رحول" handwriting — golden stroke on cream
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

const DemoPaths: React.FC = () => {
  const frame = useCurrentFrame();
  const totalLen = 2400;
  const dash = interpolate(frame, [0, 90], [totalLen, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fillOpacity = interpolate(frame, [80, 110], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subOpacity = interpolate(frame, [100, 130], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg,#fdfbf7 0%,#f5f0ea 100%)', justifyContent: 'center', alignItems: 'center', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      <svg width={900} height={500} viewBox="0 0 900 500">
        <text
          x="450" y="320"
          textAnchor="middle"
          fontSize="320"
          fontWeight="800"
          fontFamily="IBM Plex Sans Arabic, Arial, sans-serif"
          fill="#f5d491"
          fillOpacity={fillOpacity}
          stroke="#d4a94a"
          strokeWidth="4"
          strokeDasharray={totalLen}
          strokeDashoffset={dash}
          style={{ filter: 'drop-shadow(0 6px 18px rgba(212,169,74,0.25))' }}
        >
          رحول
        </text>
      </svg>
      <div style={{ fontSize: 40, color: '#2d3748', letterSpacing: 10, opacity: subOpacity, marginTop: 30 }}>منصة الذكاء متعدد الوكلاء</div>
    </AbsoluteFill>
  );
};

export default DemoPaths;
