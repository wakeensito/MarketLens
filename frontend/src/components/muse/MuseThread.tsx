import type { ReactNode } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import type { MuseCitation, MuseFeedback, MuseTurn } from './museTypes';

interface MuseThreadProps {
  thread: MuseTurn[];
  /** When non-null, the last muse turn renders as a partial string with a cursor. */
  streamingText: string | null;
  onCite: (target: string) => void;
  onAsk: (text: string) => void;
  onRegenerate: (turnIndex: number) => void;
  onFeedback: (turnIndex: number, value: MuseFeedback) => void;
}

/* ──────────────────────────────────────────────────────────
   Content rendering — parses [[target|Label]] citations and
   **bold** within a single content string. Renders inline so
   streaming partial tokens degrade gracefully to plain text.
   ────────────────────────────────────────────────────────── */

function renderInline(text: string, keyBase: string): ReactNode[] {
  if (!text) return [];
  // Split on **bold** while preserving the delimiters
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={`${keyBase}-b-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <span key={`${keyBase}-t-${i}`}>{part}</span>;
  });
}

function renderContent(
  content: string,
  onCite: (target: string) => void,
  keyBase: string,
): ReactNode[] {
  const paragraphs = content.split(/\n\n+/);
  return paragraphs.map((para, pIdx) => {
    const nodes: ReactNode[] = [];
    let cursor = 0;
    let nodeIdx = 0;
    while (cursor < para.length) {
      const openIdx = para.indexOf('[[', cursor);
      if (openIdx === -1) {
        nodes.push(...renderInline(para.slice(cursor), `${keyBase}-${pIdx}-${nodeIdx++}`));
        break;
      }
      if (openIdx > cursor) {
        nodes.push(...renderInline(para.slice(cursor, openIdx), `${keyBase}-${pIdx}-${nodeIdx++}`));
      }
      const closeIdx = para.indexOf(']]', openIdx + 2);
      if (closeIdx === -1) {
        // Streaming: incomplete token at end of partial content — render as plain text
        nodes.push(...renderInline(para.slice(openIdx), `${keyBase}-${pIdx}-${nodeIdx++}`));
        break;
      }
      const inner = para.slice(openIdx + 2, closeIdx);
      const pipeIdx = inner.indexOf('|');
      const target = pipeIdx === -1 ? inner : inner.slice(0, pipeIdx);
      const label = pipeIdx === -1 ? inner : inner.slice(pipeIdx + 1);
      const citation: MuseCitation = { kind: 'inline', target, label };
      nodes.push(
        <CitationPill
          key={`${keyBase}-${pIdx}-c-${nodeIdx++}`}
          citation={citation}
          onClick={onCite}
        />,
      );
      cursor = closeIdx + 2;
    }
    return (
      <p className="muse-prose__p" key={`${keyBase}-p-${pIdx}`}>
        {nodes}
      </p>
    );
  });
}

/** Strip citation tokens to plain labels — used for copy-to-clipboard. */
function contentToPlainText(content: string): string {
  return content.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
}

/** Render as markdown citation: `[Gap 2](#cell-gap-2)` */
function contentToMarkdownCite(content: string): string {
  return content.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '[$2](#cell-$1)');
}

/* ──────────────────────────────────────────────────────────
   Sub-components
   ────────────────────────────────────────────────────────── */

function CitationPill({
  citation,
  onClick,
}: {
  citation: MuseCitation;
  onClick: (target: string) => void;
}) {
  return (
    <button
      type="button"
      className={`muse-cite muse-cite--${citation.kind}`}
      onClick={() => onClick(citation.target)}
    >
      {citation.kind === 'cross' && <span className="muse-cite__glyph">⌗</span>}
      {citation.label}
    </button>
  );
}

function SourcesRow({
  sources,
  onCite,
}: {
  sources: MuseCitation[];
  onCite: (target: string) => void;
}) {
  if (sources.length === 0) return null;
  return (
    <div className="muse-sources">
      <span className="muse-sources__label">grounded in</span>
      <div className="muse-sources__pills">
        {sources.map((s, i) => (
          <CitationPill key={`${s.target}-${i}`} citation={s} onClick={onCite} />
        ))}
      </div>
    </div>
  );
}

function ActionRow({
  content,
  feedback,
  onRegenerate,
  onFeedback,
}: {
  content: string;
  feedback: MuseFeedback;
  onRegenerate: () => void;
  onFeedback: (value: MuseFeedback) => void;
}) {
  const copyPlain = async () => {
    try {
      await navigator.clipboard.writeText(contentToPlainText(content));
    } catch {
      /* clipboard blocked */
    }
  };
  const copyMarkdown = async () => {
    try {
      const md = contentToPlainText(content);
      const cited = contentToMarkdownCite(content);
      const block = `> ${md}\n\n${cited}`;
      await navigator.clipboard.writeText(block);
    } catch {
      /* clipboard blocked */
    }
  };
  const upActive = feedback === 'up';
  const downActive = feedback === 'down';
  return (
    <div className="muse-actions">
      <div className="muse-actions__group">
        <button type="button" className="muse-actions__btn" onClick={copyPlain}>
          copy
        </button>
        <span className="muse-actions__dot" aria-hidden>·</span>
        <button type="button" className="muse-actions__btn" onClick={onRegenerate}>
          regenerate
        </button>
        <span className="muse-actions__dot" aria-hidden>·</span>
        <button type="button" className="muse-actions__btn" onClick={copyMarkdown}>
          cite as markdown
        </button>
      </div>
      <div
        className="muse-feedback"
        role="group"
        aria-label="Was this response helpful?"
      >
        <button
          type="button"
          className={`muse-feedback__btn${upActive ? ' is-active is-up' : ''}`}
          onClick={() => onFeedback('up')}
          aria-pressed={upActive}
          aria-label="Helpful"
          title="Helpful"
        >
          <ThumbsUp
            size={14}
            strokeWidth={1.6}
            fill={upActive ? 'currentColor' : 'none'}
          />
        </button>
        <button
          type="button"
          className={`muse-feedback__btn${downActive ? ' is-active is-down' : ''}`}
          onClick={() => onFeedback('down')}
          aria-pressed={downActive}
          aria-label="Not helpful"
          title="Not helpful"
        >
          <ThumbsDown
            size={14}
            strokeWidth={1.6}
            fill={downActive ? 'currentColor' : 'none'}
          />
        </button>
      </div>
    </div>
  );
}

function FollowUps({
  questions,
  onAsk,
}: {
  questions: string[];
  onAsk: (q: string) => void;
}) {
  if (questions.length === 0) return null;
  return (
    <div className="muse-followups">
      {questions.map((q, i) => (
        <button
          key={i}
          type="button"
          className="muse-followup"
          onClick={() => onAsk(q)}
        >
          <span className="muse-followup__text">{q}</span>
          <span className="muse-followup__arrow" aria-hidden>→</span>
        </button>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Turn renderers
   ────────────────────────────────────────────────────────── */

function UserQuery({ content }: { content: string }) {
  return (
    <header className="muse-query">
      <h2 className="muse-query__heading">{content}</h2>
      <div className="muse-query__rule" aria-hidden />
    </header>
  );
}

function MuseAnswer({
  turn,
  isStreaming,
  streamingText,
  onCite,
  onAsk,
  onRegenerate,
  onFeedback,
}: {
  turn: MuseTurn;
  isStreaming: boolean;
  streamingText: string | null;
  onCite: (target: string) => void;
  onAsk: (q: string) => void;
  onRegenerate: () => void;
  onFeedback: (value: MuseFeedback) => void;
}) {
  const displayedContent =
    isStreaming && streamingText !== null ? streamingText : turn.content;
  // While the stream hasn't produced any tokens yet, hide the prose so we don't
  // render an empty paragraph before the first char arrives.
  const proseVisible =
    !isStreaming || (streamingText !== null && streamingText.length > 0);
  const showActions = !isStreaming;
  const showFollowUps = !isStreaming && (turn.followUps?.length ?? 0) > 0;

  return (
    <section className="muse-answer">
      {turn.sources && turn.sources.length > 0 && (
        <SourcesRow sources={turn.sources} onCite={onCite} />
      )}
      {proseVisible && (
        <div className="muse-prose">
          {renderContent(displayedContent, onCite, 'p')}
          {isStreaming && streamingText !== null && (
            <span className="muse-stream-cursor" aria-hidden />
          )}
        </div>
      )}
      {showActions && (
        <ActionRow
          content={turn.content}
          feedback={turn.feedback ?? null}
          onRegenerate={onRegenerate}
          onFeedback={onFeedback}
        />
      )}
      {showFollowUps && (
        <FollowUps questions={turn.followUps ?? []} onAsk={onAsk} />
      )}
    </section>
  );
}

/* ──────────────────────────────────────────────────────────
   Thread
   ────────────────────────────────────────────────────────── */

export function MuseThread({
  thread,
  streamingText,
  onCite,
  onAsk,
  onRegenerate,
  onFeedback,
}: MuseThreadProps) {
  const lastIdx = thread.length - 1;
  return (
    <div className="muse-thread">
      {thread.map((turn, i) => {
        const isLast = i === lastIdx;
        const isStreaming = isLast && turn.speaker === 'muse' && streamingText !== null;
        if (turn.speaker === 'user') {
          return <UserQuery key={i} content={turn.content} />;
        }
        return (
          <MuseAnswer
            key={i}
            turn={turn}
            isStreaming={isStreaming}
            streamingText={isLast ? streamingText : null}
            onCite={onCite}
            onAsk={onAsk}
            onRegenerate={() => onRegenerate(i)}
            onFeedback={value => onFeedback(i, value)}
          />
        );
      })}
    </div>
  );
}
