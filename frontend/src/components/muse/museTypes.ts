/** Muse types — kept local to the muse module until backend lands. */

export type MuseView = 'idle' | 'chat' | 'report-open';

export type MuseCitationKind = 'inline' | 'cross';

export interface MuseCitation {
  kind: MuseCitationKind;
  /** Label shown inside the pill (e.g. "Gap 2", "Competitor 3") */
  label: string;
  /** Stable target id for scroll / future pulse-on-cell */
  target: string;
}

/** Muse turn — single content string with inline citation tokens.
 *  - User turns: `content` is a plain query (rendered as a heading)
 *  - Muse turns: `content` is markdown-lite with `[[target|Label]]` citations and `**bold**`
 *  - `sources` shows the "GROUNDED IN" row above the prose (Perplexity-style)
 *  - `followUps` shows suggested follow-up chips after the response */
export type MuseFeedback = 'up' | 'down' | null;

export interface MuseTurn {
  speaker: 'user' | 'muse';
  content: string;
  sources?: MuseCitation[];
  followUps?: string[];
  /** Per-response feedback. Persists with the thread; backend wiring TBD. */
  feedback?: MuseFeedback;
}

