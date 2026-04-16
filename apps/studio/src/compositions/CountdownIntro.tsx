import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Sequence,
} from 'remotion';

interface CountdownIntroProps {
  brandName: string;
  accentColor: string;
}

export const CountdownIntro: React.FC<CountdownIntroProps> = ({
  brandName,
  accentColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: '#0a0a0f',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Radial pulse background */}
      <div
        style={{
          position: 'absolute',
          width: width,
          height: height,
          background: `radial-gradient(circle at 50% 50%, ${accentColor}22 0%, transparent 60%)`,
          transform: `scale(${interpolate(
            frame % 30,
            [0, 15, 30],
            [1, 1.3, 1],
            { extrapolateRight: 'clamp' }
          )})`,
        }}
      />

      {/* Countdown numbers 5, 4, 3, 2, 1 */}
      {[5, 4, 3, 2, 1].map((num, i) => {
        const startFrame = i * 25;
        const endFrame = startFrame + 25;

        return (
          <Sequence key={num} from={startFrame} durationInFrames={25}>
            <CountdownNumber num={num} fps={fps} accentColor={accentColor} />
          </Sequence>
        );
      })}

      {/* Brand reveal after countdown */}
      <Sequence from={125}>
        <BrandReveal brandName={brandName} accentColor={accentColor} fps={fps} />
      </Sequence>
    </div>
  );
};

const CountdownNumber: React.FC<{
  num: number;
  fps: number;
  accentColor: string;
}> = ({ num, fps, accentColor }) => {
  const frame = useCurrentFrame();

  const scale = spring({
    frame,
    fps,
    config: { damping: 8, stiffness: 300 },
  });

  const opacity = interpolate(frame, [0, 5, 18, 25], [0, 1, 1, 0], {
    extrapolateRight: 'clamp',
  });

  // Ring expanding outward
  const ringScale = interpolate(frame, [0, 20], [0.8, 2.5], {
    extrapolateRight: 'clamp',
  });
  const ringOpacity = interpolate(frame, [0, 8, 20], [0, 0.6, 0], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Expanding ring */}
      <div
        style={{
          position: 'absolute',
          width: 200,
          height: 200,
          borderRadius: '50%',
          border: `3px solid ${accentColor}`,
          opacity: ringOpacity,
          transform: `scale(${ringScale})`,
        }}
      />

      {/* Number */}
      <span
        style={{
          fontSize: 200,
          fontWeight: 900,
          color: '#ffffff',
          opacity,
          transform: `scale(${scale})`,
          fontFamily: 'system-ui, sans-serif',
          textShadow: `0 0 60px ${accentColor}80`,
        }}
      >
        {num}
      </span>
    </div>
  );
};

const BrandReveal: React.FC<{
  brandName: string;
  accentColor: string;
  fps: number;
}> = ({ brandName, accentColor, fps }) => {
  const frame = useCurrentFrame();

  const scale = spring({
    frame,
    fps,
    config: { damping: 10, stiffness: 100 },
  });

  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const lineWidth = spring({
    frame: Math.max(0, frame - 8),
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 24,
      }}
    >
      <span
        style={{
          fontSize: 96,
          fontWeight: 800,
          color: '#ffffff',
          opacity,
          transform: `scale(${scale})`,
          fontFamily: 'system-ui, sans-serif',
          letterSpacing: 8,
        }}
      >
        {brandName}
      </span>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          backgroundColor: accentColor,
          width: lineWidth * 300,
          opacity,
        }}
      />
    </div>
  );
};
