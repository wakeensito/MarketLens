import type { SVGProps } from 'react';

/** Amber stacked-bar mark for plinths */
export function PlinthsMark(props: Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'children'>) {
  const { className, ...rest } = props;
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden
      className={className}
      {...rest}
    >
      <rect x="0" y="28" width="36" height="6" rx="1.5" fill="#c9965a" />
      <rect x="4" y="19" width="28" height="6" rx="1.5" fill="#c9965a" opacity={0.85} />
      <rect x="9" y="10" width="18" height="6" rx="1.5" fill="#c9965a" opacity={0.65} />
      <rect x="14" y="1" width="8" height="6" rx="1.5" fill="#c9965a" opacity={0.45} />
    </svg>
  );
}

export type BrandWordmarkVariant =
  | 'landing'
  | 'workspace'
  | 'sidebar'
  | 'signin-hero'
  | 'signin-topbar'
  | 'pricing-nav'
  | 'header'
  | 'hero';

interface BrandWordmarkInnerProps {
  variant: BrandWordmarkVariant;
  /** Extra classes on the wrapper (e.g. layout helpers) */
  className?: string;
}

/** Logo mark + “plinths” wordmark */
export function BrandWordmarkInner({ variant, className }: BrandWordmarkInnerProps) {
  const cn = ['brand-wordmark-inner', `brand-wordmark-inner--${variant}`, className].filter(Boolean).join(' ');
  return (
    <span className={cn}>
      <PlinthsMark className="brand-wordmark-svg" />
      <span className="brand-wordmark-title">plinths</span>
    </span>
  );
}
