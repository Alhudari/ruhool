import { Composition } from 'remotion';
import { TextReveal } from './compositions/TextReveal';
import { CountdownIntro } from './compositions/CountdownIntro';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TextReveal"
        component={TextReveal}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          text: 'بسم الله الرحمن الرحيم',
          color: '#ffffff',
          bgColor: '#1a1a2e',
        }}
      />
      <Composition
        id="CountdownIntro"
        component={CountdownIntro}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          brandName: 'Ruhool',
          accentColor: '#e11d48',
        }}
      />
    </>
  );
};
