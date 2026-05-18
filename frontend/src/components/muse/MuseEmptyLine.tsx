interface MuseEmptyLineProps {
  /** When the plan blocks chat (or the daily Free cap is reached), show the
   *  upgrade variant instead. */
  locked?: boolean;
  onUpgrade?: () => void;
  /** Optional override for the locked-variant copy. Default is the plan
   *  upgrade line; the Free daily-cap path passes its own. Lowercase only —
   *  the CSS uppercases the whole line. */
  lockedReason?: string;
}

/** The single Plex Mono line where the thread will live before the first message.
 *  Per CLAUDE.md: no greeting bubble, no "How can I help you" copy. */
export function MuseEmptyLine({ locked = false, onUpgrade, lockedReason }: MuseEmptyLineProps) {
  if (locked) {
    return (
      <div className="muse-empty-line muse-empty-line--locked">
        <span>MUSE · {lockedReason ?? 'upgrade to chat with this report'}</span>
        {onUpgrade && (
          <button type="button" className="muse-empty-line__upgrade" onClick={onUpgrade}>
            see plans
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="muse-empty-line">
      MUSE · ready · grounded in this report
    </div>
  );
}
