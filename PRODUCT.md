# Product

## Register

product

## Name

**plinths** (lowercase, always, like vercel, github, openai). Never capitalised, never abbreviated, never punctuated. The wordmark sets it in IBM Plex Sans, weight 700, with the four-bar mark to its left. The mark colours are amber in light mode, off-white in stealth.

The name evokes a base. A platform. The thing you build the rest on. The product gives a founder the platform of intelligence they need before they commit time or money to a build.

Brief identifiers (in CSV exports, footer stamps) use the prefix `PLN-{year}-{####}`.

## Users

Early-stage founders, indie hackers, and senior operators evaluating a new business idea. Decision mode, not browsing mode. Often working alone, late, with a list of three or four ideas they need to triage before bedtime.

They are intelligent. They have read the YC essays. They have watched a thousand pitch decks. They do not need cheerleading or "let's get started" energy. They need a credible read on whether the idea has room to grow, who they're up against, and what to do first.

They will respect the product if it respects them. That means: no decoration that doesn't carry information, no friction that doesn't earn its place, no copy that wastes their time.

## Product Purpose

A founder types a business idea. The product returns a structured intelligence brief: market saturation score, competitive landscape, market gaps and opportunities, entry roadmap, trend signal, and a one-sentence recommendation.

Success is the founder closing the laptop with a clear next move. Either "this is worth my next six months" or "this is too crowded, kill it" or "the angle is gap two, not the original idea." The product replaces a week of desk research with a five-minute read.

The interaction is shaped like a chat-LLM (familiar input, threaded sidebar of past reports, signed-in workspace) but the *output* is never a chat reply. The output is a structured deliverable. There is no streaming text bubble, no "let me think about that," no conversational framing. The user types a prompt, the system runs an analysis, the user reads a report.

## Brand Personality

Calm authority. The voice of a senior research analyst who has seen ten thousand markets and respects you enough to be brief.

- Confident, never loud
- Specific, never vague
- Fast, never anxious
- Warm in light mode, exact in stealth
- Direct without being cold

The product never cheers a user on. It never warns dramatically. It states what it found, scores it on its rubric, and tells the user what the strongest move looks like. The user decides.

## References

The polish bar, in roughly descending order of relevance:

- **claude.ai** for calm warmth, generous serif type, parchment surfaces, restraint as identity. Closest visual cousin.
- **Linear** for motion budget, keyboard-first ergonomics, command palette gravity, type rigour.
- **Vercel** for monochrome discipline, single voice across surfaces, no decorative chrome.
- **Anthropic.com** for editorial type at scale, cream-on-charcoal calm, content-first density.
- **Stripe Dashboard** for information density that respects the reader, mono-for-data, signal restraint.

## Anti-references

Each line below is a thing the product must not look or feel like. If the running UI starts to drift in any of these directions, the next polish pass pulls it back.

- **ChatGPT-style grey-on-white blandness.** Plain neutral palette, undifferentiated greys, generic sans-serif chrome. Plinths is warmer, more typographic, and more specific.
- **Perplexity-style teal-on-near-black.** Aggressive cyan accent on cool dark canvas. Plinths' stealth theme is warmer (amber, not teal) and quieter (amber appears only on data and the wordmark, not on every interactive surface).
- **Generic SaaS dashboard.** Pastel cards, gradient CTAs, oversized rounded corners, "Get started in seconds" hero copy, mascot illustrations. Every one of these signals a category plinths is not in.
- **Decorative AI motion.** Orbital glows, particle fields, "thinking" sparkle effects, gradient-shifting backgrounds, anything that animates to suggest "AI happening here." The product is fast enough that the machinery does not need to be performed.
- **Conversational chat framing.** Streaming text bubbles, "Hi there!", typing indicators on outputs, "Sources" callouts mid-paragraph. The output is a deliverable, not a reply.
- **The hero-metric template.** Big number plus small label plus three supporting stats plus accent gradient. The most-saturated AI-product layout in 2026. The hero metric in plinths is the recommendation sentence, not a number.
- **Decorative controls.** Buttons that don't do anything, dropdowns that list options that aren't switchable, file-attach affordances when attachments aren't supported. Every control on screen must carry weight.
- **Word-overuse: "drop", "vibe", "magic", "supercharge", "10x", "unlock".** None of these appear in any user-facing copy.
- **Em-dashes in user-facing copy.** Replaced with commas, colons, periods, or middle dots in structural patterns.
- **Emoji in UI chrome.** Status indicators use lucide icons, never emoji glyphs. (Score colours and dotted indicators carry the semantic load.)

## Design Principles

1. **Conclusion before evidence.** Every report leads with the recommendation, then shows the work. Every screen leads with the action, then explains it. Never make the user scroll to find the answer.
2. **Restraint is the identity.** Distinctiveness comes from what the product refuses to do. One accent colour per theme. One serif, one sans, one mono. One animation curve. The product earns trust by withholding decoration competitors reach for first.
3. **Speed as a truth signal.** A fast UI is a credible UI. The interface must feel faster than the analysis it surfaces. No spinner that lingers, no transition that ornaments, no animation longer than 400ms unless it is a data-driven count-up.
4. **Two themes, one identity.** Light (Pale Intelligence) and Stealth (warm-amber-on-near-black) are the only themes. Both are first-class. The light theme is the default because the user is reading dense text. The stealth theme exists for late-night work; it is never an afterthought.
5. **Every pixel earns its place.** No control without a function, no copy without information, no motion without a reason, no border without a job. If an element can be removed without loss, it should be.
6. **Structured input, structured output.** The user provides one prompt. The system provides one report. The interaction is not a dialogue, even though the chrome borrows familiar patterns from chat tools.
7. **Mono is for system-generated data; serif is for conclusions; sans is for everything else.** This rule is non-negotiable and is what makes the report feel like a research deliverable rather than a SaaS dashboard.

## Accessibility & Inclusion

WCAG AA minimum across both themes. All score colours must hold contrast against their surface in both light and stealth. Full keyboard navigation across the search flow, sidebar, model picker, modal dialogs, and report. Visible focus rings on all interactive elements, never `outline: none` without a replacement. `prefers-reduced-motion` strips all decorative motion: parallax stops, count-ups settle to final values, sequential reveals collapse.

Screen reader labels on every icon-only button. Modal dialogs trap focus and restore on close. The auto-resizing textarea announces its purpose. Score colours never carry the only signal: every coloured score also has a label ("Open Market", "Contested Space", "Crowded Market").
