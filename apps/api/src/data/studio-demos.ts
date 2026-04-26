// Studio demo library metadata — extracted from index.ts (REL-01 stage 2d final trim).

import { PRICING } from '../state/pricing.js';
import type { StudioDemoMeta } from '../routes/studio-demos.js';

export const STUDIO_DEMOS: StudioDemoMeta[] = [
  { name: 'DemoTransitions', tool: '@remotion/transitions', description: 'Fade transitions between 3 scenes', topic: '\u062a\u0637\u0648\u0631 BIM \u0639\u0628\u0631 \u0627\u0644\u0639\u0642\u0648\u062f', durationSeconds: 9 },
  { name: 'DemoShapes', tool: '@remotion/shapes', description: 'Staggered shapes with labels', topic: '\u0623\u0634\u0643\u0627\u0644 \u0627\u0644\u0645\u0628\u0627\u0646\u064a', durationSeconds: 6 },
  { name: 'DemoPaths', tool: '@remotion/paths', description: 'Handwritten SVG path drawing', topic: '\u0643\u062a\u0627\u0628\u0629 \u0627\u0644\u0631\u062d\u0648\u0644 \u0628\u0627\u0644\u064a\u062f', durationSeconds: 5 },
  { name: 'DemoNoise', tool: '@remotion/noise', description: 'noise2D flowing grid background', topic: '\u062a\u062f\u0641\u0642 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a', durationSeconds: 5 },
  { name: 'Demo3D', tool: '@remotion/three', description: 'Rotating 3-block tower in 3D', topic: '\u0645\u0628\u0646\u0649 \u062b\u0644\u0627\u062b\u064a \u0627\u0644\u0623\u0628\u0639\u0627\u062f', durationSeconds: 6 },
  { name: 'DemoCharts', tool: 'recharts', description: 'Animated BarChart of adoption rates', topic: '\u062a\u0628\u0646\u064a BIM \u0641\u064a \u0627\u0644\u0643\u0648\u064a\u062a', durationSeconds: 6 },
  { name: 'DemoParticles', tool: 'tsparticles', description: 'Connected particle network', topic: '\u0634\u0628\u0643\u0629 \u0627\u0644\u0628\u062d\u062b', durationSeconds: 6 },
  { name: 'DemoLottie', tool: '@remotion/lottie', description: 'Animated checkmark icon', topic: '\u0623\u064a\u0642\u0648\u0646\u0629 \u0645\u062a\u062d\u0631\u0643\u0629', durationSeconds: 5 },
  { name: 'DemoMediaUtils', tool: '@remotion/media-utils', description: 'Waveform-style animated bars', topic: '\u0645\u0648\u062c\u0629 \u0627\u0644\u0635\u0648\u062a', durationSeconds: 5 },
  { name: 'DemoLayoutUtils', tool: '@remotion/layout-utils', description: 'Precise Arabic text measurement with dimension labels', topic: '\u0642\u064a\u0627\u0633 \u0627\u0644\u0646\u0635 \u0627\u0644\u0639\u0631\u0628\u064a \u0628\u062f\u0642\u0629', durationSeconds: 6, isNew: true },
  { name: 'DemoSkia', tool: '@remotion/skia', description: 'Morphing gradient blob with pastel colors', topic: '\u0631\u0633\u0645 \u0628\u0640 Skia', durationSeconds: 6, isNew: true },
  { name: 'DemoTailwind', tool: '@remotion/tailwind', description: 'Shifting gradient text and floating blur cards', topic: '\u062a\u0635\u0645\u064a\u0645 \u0628\u0640 Tailwind', durationSeconds: 6, isNew: true },
  { name: 'DemoD3', tool: 'd3', description: 'Force-directed Arabic research paper graph', topic: '\u0634\u0628\u0643\u0629 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0645\u062a\u0631\u0627\u0628\u0637\u0629', durationSeconds: 7, isNew: true },
  { name: 'DemoVisx', tool: '@visx/visx', description: 'Animated BIM adoption area chart with axes', topic: '\u062a\u062d\u0644\u064a\u0644 \u0628\u064a\u0627\u0646\u064a \u0645\u062a\u0642\u062f\u0645', durationSeconds: 7, isNew: true },
  { name: 'DemoIFC', tool: 'web-ifc', description: 'Rotating isometric BIM building with wireframes', topic: '\u0639\u0631\u0636 \u0645\u0644\u0641 BIM (IFC)', durationSeconds: 7, isNew: true },
  { name: 'DemoLeaflet', tool: 'leaflet', description: 'Real Kuwait map (OSM) with animated city pins', topic: '\u062e\u0631\u0627\u0626\u0637 \u0627\u0644\u0643\u0648\u064a\u062a', durationSeconds: 8, isNew: true },
  { name: 'DemoMapbox', tool: 'mapbox-static', description: 'Mapbox static map \u2014 requires Mapbox token in Settings', topic: '\u062e\u0631\u0627\u0626\u0637 Mapbox', durationSeconds: 7, isNew: true },
  { name: 'DemoMapTiler', tool: 'maptiler', description: 'MapTiler vector map \u2014 requires MapTiler key', topic: '\u062e\u0631\u0627\u0626\u0637 MapTiler', durationSeconds: 7, isNew: true },
  { name: 'DemoGeoapify', tool: 'geoapify', description: 'Geoapify static map \u2014 requires Geoapify key', topic: '\u062e\u0631\u0627\u0626\u0637 Geoapify', durationSeconds: 7, isNew: true },
  { name: 'DemoThunderforest', tool: 'thunderforest', description: 'Thunderforest themed OSM tiles \u2014 requires key', topic: '\u062e\u0631\u0627\u0626\u0637 Thunderforest', durationSeconds: 7, isNew: true },
  { name: 'DemoLuma', tool: 'luma-ai', description: 'Photo \u2192 3D via Luma AI \u2014 requires Luma key', topic: '\u0635\u0648\u0631\u0629 \u0625\u0644\u0649 3D', durationSeconds: 8, isNew: true },
  { name: 'DemoElevenLabs', tool: 'elevenlabs', description: 'Arabic TTS voice-over with live waveform \u2014 requires ElevenLabs key', topic: '\u062a\u0639\u0644\u064a\u0642 \u0635\u0648\u062a\u064a \u0639\u0631\u0628\u064a', durationSeconds: 8, isNew: true, autoAudio: 'elevenlabs-tts' },
  { name: 'DemoStableAudio', tool: 'stable-audio', description: 'AI-generated background music visualization \u2014 requires Stability AI key', topic: '\u0645\u0648\u0633\u064a\u0642\u0649 \u0645\u0646 \u0646\u0635', durationSeconds: 10, isNew: true, autoAudio: 'stable-audio-music' },
  { name: 'DemoPlatformIntro', tool: 'all', description: '30s platform showcase \u2014 every tool + Arabic male voice + music', topic: '\u0631\u062d\u0648\u0644 \u2014 \u0627\u0644\u0645\u0646\u0635\u0629 \u0627\u0644\u0625\u0628\u062f\u0627\u0639\u064a\u0629', durationSeconds: 30, isNew: true, autoAudio: 'platform-intro' },
];

export const DEMO_REQUIREMENTS: Record<string, { keyField: string; capability: string; serviceName: string; signupUrl: string }> = {
  DemoMapbox:        { keyField: 'mapboxToken',       capability: 'staticMaps',   serviceName: 'Mapbox Static Maps',      signupUrl: 'https://account.mapbox.com/auth/signup/' },
  DemoMapTiler:      { keyField: 'maptilerKey',       capability: 'staticMaps',   serviceName: 'MapTiler Static Maps',    signupUrl: 'https://cloud.maptiler.com/account/keys/' },
  DemoGeoapify:      { keyField: 'geoapifyKey',       capability: 'staticMaps',   serviceName: 'Geoapify Static Maps',    signupUrl: 'https://myprojects.geoapify.com/register' },
  DemoThunderforest: { keyField: 'thunderforestKey',  capability: 'tiles',        serviceName: 'Thunderforest Tiles',     signupUrl: 'https://www.thunderforest.com/docs/apikeys/' },
  DemoLuma:          { keyField: 'lumaApiKey',        capability: 'luma',         serviceName: 'Luma AI',                 signupUrl: 'https://lumalabs.ai/api/keys' },
  DemoElevenLabs:    { keyField: 'elevenlabsApiKey',  capability: 'tts',          serviceName: 'ElevenLabs TTS',          signupUrl: 'https://elevenlabs.io/app/settings/api-keys' },
  DemoStableAudio:   { keyField: 'stableAudioKey',    capability: 'stableAudio',  serviceName: 'Stable Audio',            signupUrl: 'https://platform.stability.ai/account/keys' },
};

export const DEMO_MAP_COST: Record<string, { service: string; cost: number } | undefined> = {
  DemoMapbox:        { service: 'Mapbox Static Map',  cost: PRICING.mapbox.perMapLoad },
  DemoMapTiler:      { service: 'MapTiler Static',    cost: PRICING.maptiler.perStatic },
  DemoGeoapify:      { service: 'Geoapify Static',    cost: PRICING.geoapify.perStatic },
  DemoThunderforest: { service: 'Thunderforest Tile', cost: PRICING.thunderforest.perTile * 4 },
  DemoLuma:          { service: 'Luma Dream Machine', cost: PRICING.luma.perVideo },
};

export const COST_DEMO_MAP_COST: Record<string, { service: string; cost: number }> = {
  DemoMapbox:        { service: 'Mapbox Static Map',  cost: PRICING.mapbox.perMapLoad },
  DemoMapTiler:      { service: 'MapTiler Static',    cost: PRICING.maptiler.perStatic },
  DemoGeoapify:      { service: 'Geoapify Static',    cost: PRICING.geoapify.perStatic },
  DemoThunderforest: { service: 'Thunderforest Tile', cost: PRICING.thunderforest.perTile },
  DemoLuma:          { service: 'Luma Dream Machine', cost: PRICING.luma.perVideo },
};
