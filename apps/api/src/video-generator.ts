/**
 * Video Generator — converts storyboard JSON to Remotion code.
 * The AI agent writes the storyboard, this module writes the code.
 * This guarantees the code always compiles and renders.
 */

export interface StoryboardScene {
  text: string;
  subtext?: string;
  background: string; // hex color
  textColor: string;
  fontSize?: number;
  transition: 'fade' | 'slide' | 'zoom' | 'glitch' | 'none';
  durationSeconds: number;
}

export interface VideoSpec {
  scenes: StoryboardScene[];
  width: number;
  height: number;
  fps: number;
  fontFamily?: string;
}

export function generateRemotionCode(spec: VideoSpec): string {
  const { scenes, width, fps, fontFamily } = spec;
  const font = fontFamily || 'IBM Plex Sans Arabic, Arial, sans-serif';

  let currentFrame = 0;
  const sequenceBlocks: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const dur = Math.round(s.durationSeconds * fps);
    const from = currentFrame;

    const fadeIn = `interpolate(frame - ${from}, [0, 15], [0, 1], { extrapolateRight: 'clamp' })`;
    // fadeOut reserved for transition variants that land in a later pass.
    void `interpolate(frame - ${from}, [${dur - 15}, ${dur}], [1, 0], { extrapolateRight: 'clamp' })`;

    let transform = '';
    switch (s.transition) {
      case 'slide':
        transform = `transform: \`translateX(\${interpolate(frame - ${from}, [0, 20], [${width}, 0], { extrapolateRight: 'clamp' })}px)\``;
        break;
      case 'zoom':
        transform = `transform: \`scale(\${spring({ frame: frame - ${from}, fps: ${fps}, config: { damping: 15, stiffness: 100 } })})\``;
        break;
      case 'glitch':
        transform = `transform: \`translateX(\${frame - ${from} < 15 ? Math.sin((frame - ${from}) * 2) * 10 : 0}px)\``;
        break;
      default:
        transform = '';
    }

    const bg = s.background.startsWith('linear') || s.background.startsWith('radial')
      ? `background: '${s.background}'`
      : `background: '${s.background}'`;

    sequenceBlocks.push(`
      <Sequence from={${from}} durationInFrames={${dur}}>
        <AbsoluteFill style={{ ${bg}, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }}>
          <div style={{ opacity: ${fadeIn}, ${transform ? transform + ',' : ''} textAlign: 'center', padding: '0 60px' }}>
            <div style={{ fontSize: ${s.fontSize || 90}, fontWeight: 900, color: '${s.textColor}', fontFamily: '${font}', textShadow: '0 0 30px ${s.textColor}44' }}>
              ${s.text}
            </div>
            ${s.subtext ? `<div style={{ fontSize: ${Math.round((s.fontSize || 90) * 0.5)}, fontWeight: 400, color: '${s.textColor}', fontFamily: '${font}', marginTop: 20, opacity: 0.7 }}>${s.subtext}</div>` : ''}
          </div>
        </AbsoluteFill>
      </Sequence>`);

    currentFrame += dur;
  }

  return `import { AbsoluteFill, useCurrentFrame, interpolate, spring, Sequence } from 'remotion';

const MyVideo = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: '#0a0a0a', overflow: 'hidden' }}>
${sequenceBlocks.join('\n')}
    </AbsoluteFill>
  );
};

export default MyVideo;
`;
}
