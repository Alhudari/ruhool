// Demo: Animated checkmark — SVG stroke-dashoffset (no Lottie lib)
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

const DemoLottie: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const circleSp = spring({ frame, fps, config: { damping: 18, stiffness: 100 } });
  const circleR = interpolate(circleSp, [0, 1], [0, 180]);
  const checkLen = 400;
  const checkOff = interpolate(frame, [25, 55], [checkLen, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleO = interpolate(frame, [55, 80], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg,#fdfbf7 0%,#f5f0ea 100%)', justifyContent: 'center', alignItems: 'center', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      <svg width={500} height={500} viewBox="0 0 500 500">
        <circle cx={250} cy={250} r={circleR} fill="#a8e6cf" opacity={0.4} />
        <circle cx={250} cy={250} r={circleR * 0.7} fill="#a8e6cf" />
        <path
          d="M 160 260 L 230 330 L 350 190"
          stroke="#fff"
          strokeWidth={18}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={checkLen}
          strokeDashoffset={checkOff}
        />
      </svg>
      <div style={{ fontSize: 72, fontWeight: 700, color: '#1a1a1a', letterSpacing: 6, opacity: titleO, marginTop: 40 }}>تم الإنجاز</div>
    </AbsoluteFill>
  );
};

export default DemoLottie;
