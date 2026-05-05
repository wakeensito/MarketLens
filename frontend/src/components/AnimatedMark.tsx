import { motion, useReducedMotion } from 'framer-motion';

/**
 * Animated four-bar plinths mark.
 *
 * Bars build bottom-to-top (widest to narrowest) like blocks stacking, hold,
 * fade out, repeat. The rhythm matches the brand voice — deliberate, calm,
 * without the visual restlessness of a generic spinner.
 *
 * Use for loading states. For static contexts use BrandWordmark / PlinthsMark.
 */

interface BarSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Resting opacity (matches the static PlinthsMark). */
  opacity: number;
}

const BARS: readonly BarSpec[] = [
  { x: 0,  y: 28, w: 36, h: 6, opacity: 1.00 }, // base, widest
  { x: 4,  y: 19, w: 28, h: 6, opacity: 0.85 },
  { x: 9,  y: 10, w: 18, h: 6, opacity: 0.65 },
  { x: 14, y: 1,  w: 8,  h: 6, opacity: 0.45 }, // top, narrowest
];

const BAR_STAGGER_S   = 0.18;   // 180ms between bars stacking
const BAR_FADE_IN_S   = 0.32;
const HOLD_S          = 0.6;
const FADE_OUT_S      = 0.28;
const EASE = 'easeOut' as const;

/** Total cycle: build (4 × 180ms + 320ms last) + hold + fade-out ≈ 1.92s */
const CYCLE_S = (BARS.length - 1) * BAR_STAGGER_S + BAR_FADE_IN_S + HOLD_S + FADE_OUT_S;

interface Props {
  /** Render size in px. Square. Default 36 (matches PlinthsMark viewBox). */
  size?: number;
  /** 'loop' = continuous build/hold/fade. 'once' = single build, hold final. Default 'loop'. */
  variant?: 'loop' | 'once';
  /** Pause the animation; bars settle to their resting opacities. */
  paused?: boolean;
  /** Optional className on the wrapping <span>. */
  className?: string;
  /** ARIA label. Bars are decorative by default; set this when used standalone. */
  'aria-label'?: string;
}

export default function AnimatedMark({
  size = 36,
  variant = 'loop',
  paused = false,
  className,
  'aria-label': ariaLabel,
}: Props) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = !paused && !reduceMotion;

  return (
    <span
      className={className}
      style={{ display: 'inline-block', width: size, height: size, lineHeight: 0 }}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <svg viewBox="0 0 36 36" width={size} height={size} fill="none">
        {BARS.map((bar, i) => {
          if (!shouldAnimate) {
            return (
              <rect
                key={i}
                x={bar.x}
                y={bar.y}
                width={bar.w}
                height={bar.h}
                rx={1.5}
                className="animated-mark-bar"
                style={{ opacity: bar.opacity }}
              />
            );
          }

          const buildDelay = i * BAR_STAGGER_S;

          if (variant === 'once') {
            return (
              <motion.rect
                key={i}
                x={bar.x}
                y={bar.y}
                width={bar.w}
                height={bar.h}
                rx={1.5}
                className="animated-mark-bar"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: bar.opacity, y: 0 }}
                transition={{
                  delay: buildDelay,
                  duration: BAR_FADE_IN_S,
                  ease: EASE,
                }}
              />
            );
          }

          // 'loop' — keyframed cycle. Each bar fades in at its staggered
          // offset, holds at resting opacity, all four fade out together,
          // cycle repeats.
          const totalIn  = (BARS.length - 1) * BAR_STAGGER_S + BAR_FADE_IN_S;
          const tBuildEnd = (buildDelay + BAR_FADE_IN_S) / CYCLE_S;
          const tHoldEnd  = (totalIn + HOLD_S) / CYCLE_S;

          return (
            <motion.rect
              key={i}
              x={bar.x}
              y={bar.y}
              width={bar.w}
              height={bar.h}
              rx={1.5}
              className="animated-mark-bar"
              animate={{
                opacity: [0, bar.opacity, bar.opacity, 0],
                y:       [6, 0,           0,           0],
              }}
              transition={{
                duration: CYCLE_S,
                ease: EASE,
                times: [
                  buildDelay / CYCLE_S,
                  tBuildEnd,
                  tHoldEnd,
                  1,
                ],
                repeat: Infinity,
              }}
            />
          );
        })}
      </svg>
    </span>
  );
}
