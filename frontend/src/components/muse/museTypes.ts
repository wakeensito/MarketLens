/** Muse types — kept local to the muse module until backend lands. */

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
  /** Per-response feedback. Persisted server-side on assistant rows via
   *  POST /api/muse/conversations/{report_id}/messages/{message_id}/feedback. */
  feedback?: MuseFeedback;
  /** Server-assigned id for assistant turns. Present once the `done` event
   *  has fired (or after a thread hydration from GET). User turns don't need it. */
  messageId?: string;
  /** Tags the optimistic user+placeholder pair while a stream is in flight so
   *  rollback / finalize can find them by id rather than by positional index
   *  (indices can shift under concurrent regenerate / hydration). Removed once
   *  the assistant turn is finalized. */
  pendingId?: string;
}

