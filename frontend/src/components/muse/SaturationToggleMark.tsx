/** Two-bar mini-saturation mark used as the Report destination glyph in the
 *  AI input toolbar. Echoes the report's saturation gauge — see CLAUDE.md Muse > Craft. */
export function SaturationToggleMark() {
  return (
    <span className="muse-toggle-mark" aria-hidden>
      <span className="muse-toggle-mark__bar muse-toggle-mark__bar--low" />
      <span className="muse-toggle-mark__bar muse-toggle-mark__bar--high" />
    </span>
  );
}
