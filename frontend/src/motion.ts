/**
 * Shared Framer Motion presets — matches CLAUDE.md landing entry (opacity + y, easeOut ~0.35–0.4s).
 */
export const LANDING_ENTRY_EASE = 'easeOut' as const;

export const LANDING_ENTRY_Y = 8;

export const landingFadeUpTransition = {
  duration: 0.38,
  ease: LANDING_ENTRY_EASE,
} as const;
