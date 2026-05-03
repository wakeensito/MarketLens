interface Props {
  /** Optional explanation shown on hover. */
  hint?: string;
  /** Override the label. Default "Soon". */
  label?: string;
  /** Adds left margin for inline placement next to a control label. */
  inline?: boolean;
}

/**
 * Marks a control as visible roadmap rather than shipped functionality.
 * Used per project convention: non-functional affordances stay on screen
 * to signal product velocity, but read as "intentional, coming" rather
 * than "broken".
 */
export function SoonPill({ hint, label = 'Soon', inline = false }: Props) {
  return (
    <span
      className={`soon-pill${inline ? ' soon-pill--inline' : ''}`}
      title={hint ?? `${label}, coming later`}
      aria-label={hint ?? `${label}, coming later`}
    >
      {label}
    </span>
  );
}
