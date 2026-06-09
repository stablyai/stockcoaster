// Per-ride visual themes. The curation pipeline assigns each ticker one of
// these; everything degrades gracefully to 'classic' if missing.

export const THEMES = {
  classic: {
    grass: 0x6abe30, grassAlt: 0x5aa828, foliage: 0x3f9e2a, trunk: 0x6b4a2a,
    deadTrees: false, neonOre: false, flowers: [0xfde047, 0xf87171, 0xffffff],
    signFrame: 0x8a5d3b,
  },
  space: {
    grass: 0x6abe30, grassAlt: 0x52b46a, foliage: 0x2f9e54, trunk: 0x6b4a2a,
    deadTrees: false, neonOre: false, flowers: [0xfde047, 0x93c5fd, 0xffffff],
    signFrame: 0x8a5d3b, launchpads: true,
  },
  meme: {
    grass: 0x7ddb3a, grassAlt: 0x9bea55, foliage: 0x4ade80, trunk: 0x9a3412,
    deadTrees: false, neonOre: false, flowers: [0xf472b6, 0x60a5fa, 0xfbbf24, 0x4ade80],
    signFrame: 0xb45309, rockets: true,
  },
  crypto: {
    grass: 0x34d399, grassAlt: 0x4ccfa8, foliage: 0x10b981, trunk: 0x374151,
    deadTrees: false, neonOre: true, flowers: [0x22d3ee, 0xa78bfa],
    signFrame: 0x312e81,
  },
  dotcom: {
    grass: 0x84cc16, grassAlt: 0x65a30d, foliage: 0x4d7c0f, trunk: 0x713f12,
    deadTrees: false, neonOre: false, flowers: [0xfacc15, 0xfb923c],
    signFrame: 0x57534e,
  },
  rust: {
    grass: 0x9c8a4d, grassAlt: 0x8a7440, foliage: 0x6b6b3a, trunk: 0x57534e,
    deadTrees: true, neonOre: false, flowers: [0x78716c],
    signFrame: 0x57534e,
  },
  storm: {
    grass: 0x4d7c0f, grassAlt: 0x3f6212, foliage: 0x365314, trunk: 0x44403c,
    deadTrees: false, neonOre: false, flowers: [0x94a3b8],
    signFrame: 0x44403c, darker: true,
  },
  index: {
    grass: 0x86efac, grassAlt: 0x6abe30, foliage: 0x22c55e, trunk: 0x6b4a2a,
    deadTrees: false, neonOre: false, flowers: [0xfde047, 0xf9a8d4, 0x93c5fd, 0xffffff],
    signFrame: 0x8a5d3b,
  },
};

export function getTheme(name) {
  return THEMES[name] ?? THEMES.classic;
}
