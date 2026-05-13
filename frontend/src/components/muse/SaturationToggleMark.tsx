/** Two-bar mini-saturation mark used in the toolbar when chat is active.
 *  Echoes the report's saturation gauge — see CLAUDE.md Muse > Craft. */
export function SaturationToggleMark() {
  return (
    <span className="muse-toggle-mark" aria-hidden>
      <span className="muse-toggle-mark__bar muse-toggle-mark__bar--low" />
      <span className="muse-toggle-mark__bar muse-toggle-mark__bar--high" />
    </span>
  );
}
