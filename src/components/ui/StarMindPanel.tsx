"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

import { duration, easing, toSeconds } from "@/design/tokens";
import {
  applyProposal,
  buildDistillMessages,
  conversationAtCap,
  DistillError,
  starConverse,
  starPropose,
  starReflect,
  type MindMessage,
  type StarNoteProposal,
  type StarSubtreeNote,
} from "@/mind";
import { type ConsentedStarNotes } from "@/mind-bridge";

import {
  ACTION_DISABLED,
  ACTION_HIT,
  ACTION_HIT_DENSE,
  ACTION_PRIMARY,
  ACTION_SECONDARY,
} from "./action-tiers";

interface StarMindPanelProps {
  /** The pursuit (star) whose mind this is — its id keys the consented subtree read. */
  readonly starId: string;
  /** The pursuit's name — the panel title. */
  readonly starName: string;
  /** The galaxy's name — the quiet kicker (the pursuit belongs to it). */
  readonly galaxyName: string;
  /**
   * The person's own Anthropic API key, or undefined when none is set. Used
   * ONLY as the call credential — never rendered, never logged, never placed in
   * the DOM. No key → the gentle pointer to settings (the read is gated on a
   * key too, so an unconsented/keyless star never has a note read).
   */
  readonly apiKey: string | undefined;
  /**
   * Whether THIS star's mind may read its subtree's notes (PRD 36). **Default
   * off.** Off → the gentle consent invitation; nothing is read or sent.
   * Resolved by `page.tsx` from the per-star consent store.
   */
  readonly isConsented: boolean;
  /** Turn this star's consent on/off — persisted by `page.tsx` (revocable). */
  readonly onSetConsent: (on: boolean) => void;
  /**
   * The ONE consented read door (`readConsentedStarNotes`, the bridge seam,
   * wired by `page.tsx` with the real subtree resolver) — injected so the
   * headless harness can verify it is NEVER called while consent is off, and
   * called exactly once (with this star's id) once consent is on. Returns the
   * labeled, CAPPED subtree notes + whether anything was truncated.
   */
  readonly readNotes: (starId: string) => Promise<ConsentedStarNotes>;
  /**
   * The HUMAN approves a proposed note change (PRD 36): called with the TARGET
   * body's id + the FULL new note text (the proposal applied to that body's
   * current note by the pure `applyProposal`). `page.tsx` routes it into the
   * EXISTING page editor for `targetBodyId` — prefilled + editable — where the
   * human commits it through the existing human-confirmed page-save. The mind
   * itself writes NOTHING; this callback only hands text to a human surface.
   */
  readonly onApplyProposal: (targetBodyId: string, newNoteText: string) => void;
  /** Close the panel (also fired by the Escape ladder). */
  readonly onClose: () => void;
  /**
   * The injectable fetch, threaded to the mind's client (the verification
   * boundary — the headless harness mocks HERE, so the real API is never called
   * by any test). Omitted in the app → the client's real fetch.
   */
  readonly fetchFn?: typeof fetch;
}

/** What is in flight right now. */
type Busy = null | "reflecting" | "conversing" | "proposing";
/**
 * Where the read/reflect path stands (consent-on + key only). `"error"` is a
 * **terminal** state (PRD 35.1, inherited): a failed reflect stops here with a
 * manual "try again" — never an automatic retry. This matters MORE here: the
 * bigger subtree payload trips the 429 rate limit sooner, so the no-auto-loop
 * guarantee is doing real work. The fire-once guard stays armed on failure (the
 * catch does NOT re-arm it), so a re-render can never re-fire the effect; the
 * ONLY thing that re-arms the read is an explicit "try again" click.
 */
type ReadState = "idle" | "loading" | "ready" | "empty" | "error";

/**
 * The star mind (PRD 36) — the corpus-brain arc, layer two. Opening a pursuit's
 * mind, only when its per-star consent is **on** (default off), reads **the
 * star's own notes PLUS every planet orbiting it** (the star's subtree only,
 * through the injected consented-read bridge, CAPPED), offers one
 * **cross-practice reflection** (a thread that runs across the practices — what a
 * single practice's view cannot see), can open into a PRD 33 **conversation**
 * about the whole pursuit (seeded with the subtree), and **proposes** a note
 * change that **NAMES which note** it targets (the star's own or a specific
 * planet's): a **correction** (replace an exact span) or an **addition**,
 * rendered as a **diff under the target note's name**. The mind PROPOSES; the
 * **human commits** the change in that note's existing page editor (prefilled +
 * editable) via `onApplyProposal`. The mind reads and proposes; only the human
 * writes. No body offer — the star mind creates nothing.
 *
 * The constitution, structurally: **star consent is the gate** (off → no read,
 * no call, nothing sent; the read is also gated on a key); the **read scope is
 * exactly this star's own subtree** (the bridge never reaches a sibling star or
 * the galaxy); the read is **capped in code** (over the cap, the most-recent
 * notes only, said plainly); the **write wall stays sealed** — the mind writes
 * nothing; a proposal is TEXT (now naming its target), and the human's editor
 * commits it through the existing human-confirmed page-save. The reflection +
 * conversation + the proposal are **ephemeral** (component state, stored nowhere
 * — closing forgets them); only the consent flag persists. The raw notes are
 * NEVER rendered (held in a ref) and never enter a thrown/displayed string.
 *
 * Surface mirrors `PlanetMindPanel` (the practice's mind): an absolute
 * right-anchored overlay (the canvas never resizes), strictly cool. One call per
 * explicit action, no retries; closing aborts any in-flight call. The Escape
 * ladder (capture phase, mounted while open): a focused modal stands it down →
 * the conversation input blurs → close.
 */
export function StarMindPanel({
  starId,
  starName,
  galaxyName,
  apiKey,
  isConsented,
  onSetConsent,
  readNotes,
  onApplyProposal,
  onClose,
  fetchFn,
}: StarMindPanelProps) {
  // The reflection (the opening payoff) + where the read/reflect path stands.
  const [reflection, setReflection] = useState<string | null>(null);
  const [readState, setReadState] = useState<ReadState>("idle");
  // Whether the consented read was truncated by the size cap (PRD 36) — drives a
  // plain one-line "reading its most recent notes" note. Honest, never silent.
  const [truncated, setTruncated] = useState(false);
  // Bumped ONLY by the "try again" click (PRD 35.1, inherited) — the one allowed
  // re-arm of the read→reflect path. The effect depends on it, so a click re-runs
  // the read exactly once; nothing else ever changes it, so a failure can never
  // auto-retry.
  const [retryNonce, setRetryNonce] = useState(0);

  // The conversation — ephemeral, opened on "talk about this".
  const [conversing, setConversing] = useState(false);
  const [transcript, setTranscript] = useState<MindMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  // The proposed note change (PRD 36) — set once "propose a change" succeeds.
  // Non-null shows the diff under the target note's name. The full new note text
  // (`proposedNote`) is computed at propose-time from the private notes ref and
  // held in state — NEVER read from the ref during render.
  const [proposal, setProposal] = useState<StarNoteProposal | null>(null);
  const [proposedNote, setProposedNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  // The star's whole subtree's notes (labeled) — held ONLY to seed the
  // conversation/proposal (they ride in the system prompt) and to apply a
  // proposal against the NAMED body's current note. NEVER rendered. A ref, not
  // state, so it can never be reached by a render path.
  const bodiesRef = useRef<readonly StarSubtreeNote[] | null>(null);
  // The read/reflect runs once per consented+keyed star; this guards it.
  const loadStartedRef = useRef(false);
  // The in-flight call's controller. Closing the panel unmounts it → abort.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  // The read → reflect path. Fires ONCE, only when consent is on AND a key is
  // present (off or keyless → no read, no call). This is the UI half of the
  // gate; the bridge's `readConsentedStarNotes` is the structural half (off →
  // returns nothing even if called).
  useEffect(() => {
    if (!isConsented || !apiKey) return;
    if (loadStartedRef.current) return;
    loadStartedRef.current = true;
    setReadState("loading");
    const controller = new AbortController();
    abortRef.current = controller;
    void (async () => {
      try {
        const { notes, truncated: wasTruncated } = await readNotes(starId);
        if (notes.length === 0) {
          setReadState("empty");
          return;
        }
        bodiesRef.current = notes;
        setTruncated(wasTruncated);
        const text = await starReflect(notes, apiKey, {
          fetchFn,
          signal: controller.signal,
        });
        setReflection(text);
        setReadState("ready");
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return; // a close, not an error
        // STOP in a terminal "error" state (PRD 35.1, inherited — load-bearing
        // here: the bigger payload trips 429 sooner). Do NOT reset
        // `loadStartedRef` — the guard stays armed, so this state change cannot
        // re-fire the effect (no automatic retry loop, no silent billed spend).
        // Only an explicit "try again" click re-arms the read. The message is the
        // SAFE constant — never the key, never the notes.
        setReadState("error");
        setError(
          e instanceof DistillError ? e.message : "the call didn't go through",
        );
      }
    })();
  }, [isConsented, apiKey, starId, readNotes, fetchFn, retryNonce]);

  // "try again" (PRD 35.1, inherited) — the ONLY re-arm of the read→reflect path,
  // and only ever from a human click. Reset the guard, clear the error, return to
  // idle, and bump the nonce so the effect re-runs the read exactly once.
  function handleRetry() {
    loadStartedRef.current = false;
    setError(null);
    setReadState("idle");
    setRetryNonce((n) => n + 1);
  }

  // The star-mind Escape ladder — innermost layer first, one per press.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const active = document.activeElement;
      if (active?.closest("form, [role='alertdialog'], [role='dialog']")) return;
      if (
        active instanceof HTMLElement &&
        active.matches("textarea[data-fog-input]")
      ) {
        active.blur();
        e.stopImmediatePropagation();
        return;
      }
      onClose();
      e.stopImmediatePropagation();
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  const atCap = conversationAtCap(transcript);

  // A "send" — one star-converse turn (the subtree rides in the system prompt).
  // The user turn is optimistic; on failure it rolls back and the text is
  // restored, so the transcript always ends on an assistant turn (or empty).
  async function handleSend() {
    if (!apiKey || busy !== null || atCap) return;
    const bodies = bodiesRef.current;
    if (bodies === null) return;
    const text = input.trim();
    if (text === "") {
      setAttempted(true);
      return;
    }
    setAttempted(false);
    setError(null);
    const userTurn: MindMessage = { role: "user", content: text };
    const sent = [...transcript, userTurn];
    setTranscript(sent);
    setInput("");
    setBusy("conversing");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const reply = await starConverse(bodies, sent, apiKey, {
        fetchFn,
        signal: controller.signal,
      });
      setTranscript([...sent, { role: "assistant", content: reply }]);
      setBusy(null);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return; // a close, not an error
      setTranscript(transcript); // roll back the optimistic user turn
      setInput(text); // restore for a clean retry
      setBusy(null);
      setError(
        e instanceof DistillError ? e.message : "the call didn't go through",
      );
    }
  }

  // "Propose a change" (PRD 36) — the person's command. The mind reads the
  // subtree + the conversation and PROPOSES one note change that NAMES its target
  // body (a correction, an addition, or none). It writes nothing; the human
  // reviews the diff under the target note's name and commits any change in that
  // note's editor.
  async function handlePropose() {
    if (!apiKey || busy !== null) return;
    const bodies = bodiesRef.current;
    if (bodies === null) return;
    setAttempted(false);
    setError(null);
    const pending = input;
    const messages = buildDistillMessages(transcript, pending);
    setInput("");
    setProposal(null);
    setProposedNote(null);
    setBusy("proposing");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const proposed = await starPropose(bodies, messages, apiKey, {
        fetchFn,
        signal: controller.signal,
      });
      // Apply the proposal to the NAMED body's current note HERE (an event
      // handler — reading the private notes ref is allowed off-render), and store
      // the full new note text in state for the editor. `null` when nothing
      // cleanly applies (kind "none", an unnamed/invalid target, or a quoted span
      // that isn't in the named note → never a guess).
      const targetNote =
        proposed.targetBodyId !== null
          ? (bodies.find((b) => b.bodyId === proposed.targetBodyId)?.notes ?? null)
          : null;
      setProposal(proposed);
      setProposedNote(
        targetNote !== null ? applyProposal(targetNote, proposed) : null,
      );
      setBusy(null);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return; // a close, not an error
      setInput(pending); // restore the typed thought for a clean retry
      setBusy(null);
      setError(
        e instanceof DistillError ? e.message : "the call didn't go through",
      );
    }
  }

  return (
    <motion.aside
      aria-label="This pursuit's mind"
      className="pointer-events-auto absolute inset-y-0 right-0 z-10 flex w-[34%] flex-col border-l border-haze/10 bg-abyss"
      initial={{ opacity: 0, x: "100%" }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: "100%" }}
      transition={{ duration: toSeconds(duration.base), ease: easing.cinematic }}
    >
      {/* Header — the kicker is the galaxy; the title is the pursuit. */}
      <header className="flex items-start justify-between gap-4 px-8 pb-2 pt-8">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="truncate text-[10px] font-light uppercase tracking-[0.4em] text-haze/50">
            {galaxyName}
          </p>
          <h2 className="truncate text-base font-light tracking-wide text-starlight/90">
            {starName}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close this pursuit's mind"
          className={`shrink-0 ${ACTION_HIT_DENSE} ${ACTION_SECONDARY}`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M6 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      <div className="app-scroll flex flex-1 flex-col gap-6 overflow-y-auto px-8 pb-8 pt-6">
        {apiKey === undefined ? (
          // No key → say so gently and point home. No read, no dead input.
          <p className="text-sm font-light leading-relaxed text-haze/70">
            the mind needs a key — add your Anthropic API key in settings (the
            gear, bottom right).
          </p>
        ) : !isConsented ? (
          // Consent OFF (the default): the honest invitation, stated plainly —
          // turning it on lets the mind read this pursuit AND every practice
          // under it. NOTHING is read or sent until then — per star, no dark
          // pattern.
          <div className="flex flex-col gap-5">
            <p className="text-sm font-light leading-relaxed text-haze/70">
              this pursuit&apos;s mind is asleep. Turn it on and it will read{" "}
              <span className="text-haze/90">
                this pursuit and every practice under it
              </span>{" "}
              — nothing else — and send those notes to your AI provider when you
              open its mind, to offer one reflection across them.
            </p>
            <p className="text-[11px] font-light leading-relaxed text-haze/45">
              off by default; you can turn it back off any time. It never reads
              another pursuit or the galaxy. A larger read than a single
              practice&apos;s — its own decision.
            </p>
            <button
              type="button"
              onClick={() => onSetConsent(true)}
              className={`self-start text-xs font-light uppercase tracking-[0.3em] ${ACTION_HIT} ${ACTION_PRIMARY}`}
            >
              let this pursuit&apos;s mind read its notes
            </button>
          </div>
        ) : (
          // Consent ON + a key: read this star's whole subtree (capped) → reflect
          // across the practices → optional conversation → propose a named change.
          <>
            {readState === "loading" && (
              <p className="text-[11px] font-light tracking-wide text-haze/40">
                the mind is reading this pursuit&apos;s notes…
              </p>
            )}

            {readState === "empty" && (
              <p className="text-sm font-light leading-relaxed text-haze/70">
                this pursuit has no notes yet — not in its own notebook nor in any
                of its practices. The mind reflects on what you&apos;ve written.
                Add some notes (the &ldquo;notes&rdquo; action), then open its mind.
              </p>
            )}

            {/* The read→reflect failed (PRD 35.1, inherited) — a TERMINAL state,
                not a retry loop. The safe message (a 429 says to wait a moment),
                then a manual "try again" — the ONLY thing that re-runs the read.
                Strictly cool. */}
            {readState === "error" && (
              <div className="flex flex-col gap-4">
                <p className="text-sm font-light leading-relaxed text-haze/70">
                  {error ?? "the call didn't go through"}
                </p>
                <button
                  type="button"
                  onClick={handleRetry}
                  className={`self-start text-xs font-light uppercase tracking-[0.3em] ${ACTION_HIT} ${ACTION_SECONDARY}`}
                >
                  try again
                </button>
              </div>
            )}

            {/* Honest truncation (PRD 36) — when the subtree was over the size
                cap, the mind read the most-recent notes only. Never a silent drop. */}
            {readState === "ready" && truncated && (
              <p className="text-[11px] font-light leading-relaxed text-haze/45">
                this pursuit is large — the mind is reading its most recent notes.
              </p>
            )}

            {reflection !== null && (
              <div className="flex flex-col gap-3">
                <p className="text-[10px] font-light uppercase tracking-[0.4em] text-haze/40">
                  the mind notices
                </p>
                <p className="whitespace-pre-wrap text-sm font-light leading-relaxed text-starlight">
                  {reflection}
                </p>
                {!conversing && proposal === null && (
                  <button
                    type="button"
                    onClick={() => setConversing(true)}
                    className={`self-start text-xs font-light uppercase tracking-[0.3em] ${ACTION_HIT} ${ACTION_PRIMARY}`}
                  >
                    talk about this
                  </button>
                )}
              </div>
            )}

            {/* The conversation (PRD 33's machinery, seeded with the subtree). */}
            {conversing && (
              <>
                {transcript.length > 0 && (
                  <div className="flex flex-col gap-5 border-t border-haze/10 pt-6">
                    {transcript.map((turn, i) => (
                      <div key={i} className="flex flex-col gap-2">
                        {turn.role === "assistant" && (
                          <p className="text-[10px] font-light uppercase tracking-[0.4em] text-haze/40">
                            the mind
                          </p>
                        )}
                        <p
                          className={`whitespace-pre-wrap text-sm font-light leading-relaxed ${
                            turn.role === "user" ? "text-starlight/90" : "text-haze"
                          }`}
                        >
                          {turn.content}
                        </p>
                      </div>
                    ))}
                    {busy === "conversing" && (
                      <p className="text-[11px] font-light tracking-wide text-haze/40">
                        the mind is considering…
                      </p>
                    )}
                  </div>
                )}

                {proposal === null ? (
                  <>
                    {atCap ? (
                      <p className="text-[11px] font-light leading-relaxed text-haze/50">
                        this is a full conversation — propose a change from what we
                        have.
                      </p>
                    ) : (
                      <textarea
                        data-fog-input
                        aria-label="Your turn"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={busy !== null}
                        rows={transcript.length > 0 ? 3 : 4}
                        placeholder="your turn — what's on your mind about this pursuit?"
                        className="resize-none border-b border-haze/20 bg-transparent pb-2 text-sm font-light leading-relaxed text-starlight caret-haze outline-none transition-colors duration-200 ease-soft placeholder:text-haze/40 focus:border-haze/50 disabled:opacity-50"
                      />
                    )}

                    <div className="flex items-baseline gap-6">
                      {!atCap && (
                        <button
                          type="button"
                          onClick={() => void handleSend()}
                          disabled={busy !== null}
                          className={`text-xs font-light uppercase tracking-[0.3em] ${ACTION_HIT} ${
                            busy !== null ? ACTION_DISABLED : ACTION_PRIMARY
                          }`}
                        >
                          {busy === "conversing" ? "sending…" : "send"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handlePropose()}
                        disabled={busy !== null}
                        className={`text-xs font-light uppercase tracking-[0.3em] ${ACTION_HIT} ${
                          busy !== null ? ACTION_DISABLED : ACTION_PRIMARY
                        }`}
                      >
                        {busy === "proposing" ? "proposing…" : "propose a change"}
                      </button>
                      {attempted && input.trim() === "" && (
                        <p className="text-[11px] font-light tracking-wide text-haze/70">
                          the mind needs a turn first.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  // The proposal — the mind PROPOSES a note change and NAMES which
                  // note (PRD 36); only the human writes. Rendered as a precise
                  // diff under the target note's name; approving opens THAT note's
                  // editor prefilled + editable; dismissing leaves every note
                  // untouched. Never a silent apply, never the wrong note, never a
                  // black-box full rewrite. Only the mind's proposed delta is shown
                  // — the raw notes are never rendered.
                  <StarNoteProposalReview
                    proposal={proposal}
                    proposedNote={proposedNote}
                    onApprove={onApplyProposal}
                    onDismiss={() => {
                      setProposal(null);
                      setProposedNote(null);
                    }}
                  />
                )}
              </>
            )}

            {/* Conversation/proposal errors are facts, stated quietly — never the
                key or the notes. The read→reflect error has its own terminal block
                above (with "try again"), so it is excluded here to avoid doubling. */}
            {error !== null && readState !== "error" && (
              <p className="text-[11px] font-light tracking-wide text-haze/70">
                {error}
              </p>
            )}

            {/* Honest + revocable: the mind is reading this pursuit; turn it off. */}
            <button
              type="button"
              onClick={() => onSetConsent(false)}
              className={`mt-2 self-start text-[10px] font-light uppercase tracking-[0.3em] ${ACTION_HIT_DENSE} ${ACTION_SECONDARY}`}
            >
              stop reading this pursuit
            </button>
          </>
        )}
      </div>
    </motion.aside>
  );
}

interface StarNoteProposalReviewProps {
  /** The mind's proposed change (PRD 36) — a correction, an addition, or none, naming its target. */
  readonly proposal: StarNoteProposal;
  /**
   * The full new note text the target body's editor would be prefilled with (the
   * proposal applied to that body's current note by the pure `applyProposal`), or
   * `null` when there is nothing to cleanly apply (kind "none", an unnamed/invalid
   * target, or a correction span the mind quoted that isn't actually in the note —
   * never a guessed edit).
   */
  readonly proposedNote: string | null;
  /** The HUMAN approves: hand the target body's id + full new note text to the editor. */
  readonly onApprove: (targetBodyId: string, newNoteText: string) => void;
  /** Dismiss the proposal — every note is left byte-for-byte unchanged. */
  readonly onDismiss: () => void;
}

/**
 * Render a proposed note change (PRD 36) as a precise DIFF under the TARGET
 * note's name, which the human reviews then commits in that note's editor
 * (prefilled + editable) or dismisses. This is the sharpened bright line made
 * visible: the mind proposed, it named WHICH note, and only the human writes.
 *
 *   - The target note's name is shown prominently first ("the mind suggests a
 *     correction to your *Rendering* notes") so the human always knows which
 *     notebook the change lands in.
 *   - A correction shows the exact old span (struck through, dim) → the new text
 *     (bright). An addition shows the new block + that it appends. Never the whole
 *     note (a full-replace is where a misread quietly drops a paragraph).
 *   - When nothing cleanly applies (kind "none", an unnamed/invalid target, or a
 *     span not in the named note), there is no diff to approve — say so honestly,
 *     offer only "keep talking".
 *
 * Only the mind's proposed delta is rendered here — never the raw notes.
 */
function StarNoteProposalReview({
  proposal,
  proposedNote,
  onApprove,
  onDismiss,
}: StarNoteProposalReviewProps) {
  const dismissLabel = "text-xs font-light uppercase tracking-[0.3em]";

  // Nothing cleanly applies — the honest default. No diff, no approve.
  if (proposedNote === null || proposal.targetBodyId === null) {
    return (
      <div className="flex flex-col gap-4 border-t border-haze/10 pt-6">
        <p className="text-sm font-light leading-relaxed text-haze/70">
          the conversation didn&apos;t surface a change to your notes.
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className={`self-start ${dismissLabel} ${ACTION_HIT} ${ACTION_SECONDARY}`}
        >
          keep talking
        </button>
      </div>
    );
  }

  const targetBodyId = proposal.targetBodyId;
  const targetName = proposal.targetBodyName ?? "these";

  return (
    <div className="flex flex-col gap-4 border-t border-haze/10 pt-6">
      {/* The target note's name, prominent — which notebook this change lands in. */}
      <p className="text-[10px] font-light uppercase tracking-[0.4em] text-haze/50">
        {proposal.kind === "correction"
          ? "the mind suggests a correction to your"
          : "the mind suggests adding to your"}{" "}
        <span className="text-haze/90">{targetName}</span> notes
      </p>

      {proposal.kind === "correction" ? (
        <div className="flex flex-col gap-3">
          <p className="whitespace-pre-wrap text-sm font-light leading-relaxed text-haze/45 line-through">
            {proposal.oldText}
          </p>
          <p className="whitespace-pre-wrap text-sm font-light leading-relaxed text-starlight">
            {proposal.newText}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="whitespace-pre-wrap text-sm font-light leading-relaxed text-starlight">
            {proposal.newText}
          </p>
          <p className="text-[11px] font-light tracking-wide text-haze/40">
            added to the end of your {targetName} notes
          </p>
        </div>
      )}

      <div className="flex items-baseline gap-6">
        {/* Approve → the EXISTING page editor for the NAMED body, prefilled +
            editable; the human saves through the existing human-confirmed
            page-save. The mind writes nothing. */}
        <button
          type="button"
          onClick={() => onApprove(targetBodyId, proposedNote)}
          className={`text-xs font-light uppercase tracking-[0.3em] ${ACTION_HIT} ${ACTION_PRIMARY}`}
        >
          approve — open in the editor
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className={`${dismissLabel} ${ACTION_HIT} ${ACTION_SECONDARY}`}
        >
          dismiss
        </button>
      </div>
    </div>
  );
}
