/**
 * Shared Framer Motion presets — matches CLAUDE.md landing entry (opacity + y, easeOut ~0.35–0.4s).
 */
export const LANDING_ENTRY_EASE = 'easeOut' as const;

export const LANDING_ENTRY_Y = 8;

export const landingEntryInitial = { opacity: 0, y: LANDING_ENTRY_Y } as const;

/** Standard landing block entry — optional delay for stagger (0.06–0.09s steps at parent if needed). */
export function landingEntryAnimate(delay: number) {
  return {
    opacity: 1,
    y: 0,
    transition: { delay, duration: 0.35, ease: LANDING_ENTRY_EASE },
  };
}

export const landingFadeUpTransition = {
  duration: 0.38,
  ease: LANDING_ENTRY_EASE,
} as const;
