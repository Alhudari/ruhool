/**
 * Model / service pricing table (USD). Extracted from index.ts (REL-01 stage 2d).
 * Conservative, "good enough for budgeting". Pure leaf constant.
 */
export const PRICING = {
  elevenlabs: { perChar: 0.00022 },              // Free tier: 10k free/month, then ~$0.00022/char
  stableAudio: { perTrack: 0.09 },                // 9 credits ≈ $0.09 per track (free: 25 credits signup)
  groqWhisper: { perMinute: 0 },                  // Currently free / very cheap
  mapbox: { perMapLoad: 0.005 },                  // Free 50k/mo, then $5/1000
  maptiler: { perStatic: 0.0005 },                // Generous free tier
  geoapify: { perStatic: 0.0002 },
  thunderforest: { perTile: 0 },                  // Free hobby tier
  luma: { perVideo: 0.35 },                       // Dream Machine per 5s video
  ffmpegMux: { perOp: 0 },                        // Local — free
};
