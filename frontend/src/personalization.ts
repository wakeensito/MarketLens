// Frontend-first personalization capture. Persisted to localStorage; the shape
// here is the schema the backend / report pipeline / Muse will later consume.
//
// Consumption status (v1):
//   preferredName    — LIVE: workspace empty-state greeting
//   building         — captured; report framing wires in with the pipeline work
//   marketFocus      — captured; report framing wires in with the pipeline work
//   museInstructions — captured only; Muse prompt behavior is engineered separately

export interface Personalization {
  preferredName:    string;
  building:         string;
  marketFocus:      string;
  museInstructions: string;
}

export const EMPTY_PERSONALIZATION: Personalization = {
  preferredName:    '',
  building:         '',
  marketFocus:      '',
  museInstructions: '',
};

const KEY = 'plinths-personalization';

export function getPersonalization(): Personalization {
  if (typeof window === 'undefined') return { ...EMPTY_PERSONALIZATION };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY_PERSONALIZATION };
    const parsed = JSON.parse(raw) as Partial<Personalization>;
    // Merge over defaults so a partial/older blob never yields undefined fields.
    return {
      preferredName:    typeof parsed.preferredName    === 'string' ? parsed.preferredName    : '',
      building:         typeof parsed.building         === 'string' ? parsed.building         : '',
      marketFocus:      typeof parsed.marketFocus      === 'string' ? parsed.marketFocus      : '',
      museInstructions: typeof parsed.museInstructions === 'string' ? parsed.museInstructions : '',
    };
  } catch {
    return { ...EMPTY_PERSONALIZATION };
  }
}

export function setPersonalization(patch: Partial<Personalization>): Personalization {
  const next = { ...getPersonalization(), ...patch };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Storage full / unavailable (private mode) — fail silently; the in-memory
      // value still drives the current session.
    }
  }
  return next;
}
