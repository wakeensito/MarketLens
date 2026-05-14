"""Citation token + sentinel handling for the streaming response.

Two parsing concerns:

1. **Citation tokens**: the model emits `[[target|Label]]` inline. The frontend
   parser at `frontend/src/components/muse/MuseThread.tsx` recognizes the
   token; the backend just needs to extract `{target, label}` pairs out of
   the final assembled prose so they can be packed into `event: done.sources`.

2. **Follow-up sentinel**: the model is prompted to append
   `<<MUSE_META>>{...json...}<<END>>` at the very end of generation. The
   backend strips that envelope from the live stream (so the user never sees
   it) and parses the JSON into `follow_ups` for `event: done`.

A small streaming buffer (`MetaStripper`) handles the case where the sentinel
arrives split across two Bedrock chunks.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass


CITATION_RE = re.compile(r"\[\[([^\[\]\|]+)\|([^\[\]]+)\]\]")

META_START = "<<MUSE_META>>"
META_END = "<<END>>"


# ─── Sources ───


@dataclass(frozen=True)
class Citation:
    kind: str  # always "inline" in v1 (Pro tier); "cross" reserved for Max
    target: str
    label: str

    def as_dict(self) -> dict:
        return {"kind": self.kind, "target": self.target, "label": self.label}


def extract_citations(text: str) -> list[Citation]:
    """Return unique `[[target|Label]]` pairs from the final assembled text.

    Preserves the order of first appearance. Duplicate (target,label) pairs
    are collapsed — the frontend pill row should not show the same source
    twice in a row.
    """
    seen: set[tuple[str, str]] = set()
    out: list[Citation] = []
    for m in CITATION_RE.finditer(text):
        target = m.group(1).strip()
        label = m.group(2).strip()
        key = (target, label)
        if not target or not label or key in seen:
            continue
        seen.add(key)
        out.append(Citation(kind="inline", target=target, label=label))
    return out


# ─── Meta sentinel stripper ───


class MetaStripper:
    """Removes the `<<MUSE_META>>...<<END>>` envelope from a token stream.

    Usage:
        stripper = MetaStripper()
        for delta in bedrock_deltas:
            visible = stripper.feed(delta)
            if visible:
                yield_to_client(visible)
        stripper.finish()   # flush any held tail that wasn't actually the sentinel
        meta = stripper.meta()  # parsed JSON dict, or {} if absent / malformed

    Algorithm:
      - Maintain a small trailing buffer (= len of META_START − 1) so we can
        catch the sentinel even if it's split across chunks.
      - Once we see META_START, route subsequent characters into the meta
        buffer until we see META_END or the stream ends.
      - Anything before META_START flows through to the client untouched.
    """

    def __init__(self) -> None:
        self._tail: str = (
            ""  # last few chars held back (potential prefix of META_START)
        )
        self._meta_buf: str = ""  # characters captured between META_START and META_END
        self._in_meta: bool = False
        self._meta_done: bool = False
        self._safe_tail_len: int = len(META_START) - 1

    def feed(self, chunk: str) -> str:
        """Consume a chunk; return the substring safe to forward to the client."""
        if not chunk:
            return ""

        # Once META_END has been observed, the meta envelope is closed and the
        # response is over. Any further chunks are model trailing noise we must
        # never forward (otherwise text could leak through after the sentinel).
        if self._meta_done:
            self._tail = ""
            return ""

        if self._in_meta:
            self._meta_buf += chunk
            end_idx = self._meta_buf.find(META_END)
            if end_idx != -1:
                # Anything after META_END is dropped (no spec for it).
                self._meta_buf = self._meta_buf[:end_idx]
                self._meta_done = True
                self._in_meta = False
            return ""

        # Combine held tail with the new chunk.
        combined = self._tail + chunk
        start_idx = combined.find(META_START)
        if start_idx != -1:
            visible = combined[:start_idx]
            after_start = combined[start_idx + len(META_START) :]
            self._tail = ""
            # Re-enter the in_meta path to consume the rest in this chunk too.
            self._in_meta = True
            tail_visible = self.feed(after_start)
            return visible + tail_visible

        # No sentinel yet. Hold back enough trailing chars to catch a sentinel
        # that crosses the next chunk boundary.
        if len(combined) <= self._safe_tail_len:
            self._tail = combined
            return ""
        cutoff = len(combined) - self._safe_tail_len
        visible = combined[:cutoff]
        self._tail = combined[cutoff:]
        return visible

    def finish(self) -> str:
        """Flush any held tail at end-of-stream. Returns the final visible chars."""
        if self._in_meta or self._meta_done:
            return ""
        out = self._tail
        self._tail = ""
        return out

    def meta(self) -> dict:
        """Return parsed meta JSON, or `{}` on malformed / missing."""
        if not self._meta_buf:
            return {}
        try:
            parsed = json.loads(self._meta_buf.strip())
        except (json.JSONDecodeError, ValueError):
            return {}
        return parsed if isinstance(parsed, dict) else {}


# ─── Sentence boundary detection ───


def _is_inside_citation(buf: str) -> bool:
    """True if the last unmatched `[[` has no matching `]]` after it."""
    last_open = buf.rfind("[[")
    last_close = buf.rfind("]]")
    return last_open != -1 and last_open > last_close


def detect_sentence_boundary(prev_buf: str, new_chars: str) -> bool:
    """Did the new chars push past a sentence-final `.`, `!`, or `?` while
    NOT inside a `[[...]]` citation token?
    """
    if not new_chars:
        return False
    for i, ch in enumerate(new_chars):
        if ch in ".!?":
            # Check at the point that punctuation was emitted, not at end.
            cumulative = prev_buf + new_chars[: i + 1]
            if not _is_inside_citation(cumulative):
                return True
    return False
