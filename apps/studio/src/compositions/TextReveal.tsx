import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Sequence,
} from 'remotion';

interface TextRevealProps {
  text: string;
  color: string;
  bgColor: string;
}

export const TextReveal: React.FC<TextRevealProps> = ({
  text,
  color,
  bgColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(' ');

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: bgColor,
        padding: 80,
        direction: 'rtl',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 24,
        }}
      >
        {words.map((word, i) => {
          const delay = i * 8;

          return (
            <Sequence key={i} from={delay}>
              <Word word={word} color={color} fps={fps} />
            </Sequence>
          );
        })}
      </div>

      {/* Underline animation */}
      <div
        style={{
          marginTop: 60,
          height: 4,
          borderRadius: 2,
          backgroundColor: '#e11d48',
          width: interpolate(
            frame,
            [words.length * 8, words.length * 8 + 30],
            [0, 600],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          ),
        }}
      />
    </div>
  );
};

const Word: React.FC<{ word: string; color: string; fps: number }> = ({
  word,
  color,
  fps,
}) => {
  const frame = useCurrentFrame();

  const scale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 200 },
  });

  const opacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const translateY = interpolate(frame, [0, 15], [40, 0], {
    extrapolateRight: 'clamp',
  });

  return (
    <span
      style={{
        fontSize: 72,
        fontWeight: 700,
        color,
        fontFamily: 'Arial, sans-serif',
        opacity,
        transform: `scale(${scale}) translateY(${translateY}px)`,
        display: 'inline-block',
      }}
    >
      {word}
    </span>
  );
};
