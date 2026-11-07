"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

import { duration, easing, toSeconds } from "@/design/tokens";
import {
  applyProposal,
  buildDistillMessages,
  conversationAtCap,
  DistillError,
  planetConverse,
  planetPropose,
  reflect,
  type MindMessage,
  type PlanetNoteProposal,
} from "@/mind";

import {
  ACTION_DISABLED,
  ACTION_HIT,
  ACTION_HIT_DENSE,
  ACTION_PRIMARY,
  ACTION_SECONDARY,
} from "./action-tiers";

interface PlanetMindPanelProps {
  /** The practice (planet) whose mind this is — its id keys the consented read. */
  readonly planetId: string;
  /** The practice's name — the panel title. */
  readonly planetName: string;
  /** The parent pursuit's name — the quiet kicker (the practice belongs to it). */
  readonly starName: string;
  /**
   * The person's own Anthropic API key, or undefined when none is set. Used
   * ONLY as the call credential — never rendered, never logged, never placed in
   * the DOM. No key → the gentle pointer to settings (the read is gated on a
   * key too, so an unconsented/keyless planet never has a note read).
   */
  readonly apiKey: string | undefined;
  /**
   * Whether THIS planet's mind may read its notes (PRD 34). **Default off.**
   * Off → the gentle consent invitation; nothing is read or sent. Resolved by
   * `page.tsx` from the per-planet consent store.
   */
  readonly isConsented: boolean;
  /** Turn this planet's consent on/off — persisted by `page.tsx` (revocable). */
  readonly onSetConsent: (on: boolean) => void;
  /**
   * The ONE consented read door (`readConsentedPlanetNotes`, the bridge seam) —
   * injected so the headless harness can verify it is NEVER called while consent
   * is off, and called exactly once (with this planet's id) once consent is on.
   * Returns plain strings — only ever this one planet's own notes.
   */
  readonly readNotes: (planetId: string) => Promise<string[]>;
  /**
   * The HUMAN approves a proposed note change (PRD 35): called with the FULL new
   * note text (the proposal applied to the current note by the pure
   * `applyProposal`). `page.tsx` routes it into the EXISTING page editor for this
   * planet — prefilled + editable — where the human commits it through the
   * existing human-confirmed page-save. The mind itself writes NOTHING; this
   * callback only hands text to a human surface.
   */
  readonly onApplyProposal: (newNoteText: string) => void;
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
 * **terminal** state (PRD 35.1): a failed reflect stops here with a manual "try
 * again" — never an automatic retry. The fire-once guard stays armed on failure
 * (the catch does NOT re-arm it), so a re-render can never re-fire the effect; the
 * ONLY thing that re-arms the read is an explicit "try again" click.
 */
type ReadState = "idle" | "loading" | "ready" | "empty" | "error";

/**
 * The planet mind (PRD 34, refined in PRD 35) — the first deliberate opening of
 * the PRD 26 read-sandbox, by exactly one consented door. Opening a practice's
 * mind, only when its per-planet consent is **on** (default off), reads **only
 * that practice's own notes** (through the injected consented-read bridge),
 * offers one **reflection** (an honest noticing), can open into a PRD 33
 * **conversation** about the practice (seeded with the notes), and — PRD 35 —
 * **proposes** a note change: a **correction** (replace an exact span) or an
 * **addition** (append new text), rendered here as a **diff**. The mind PROPOSES;
 * the **human commits** the change in the existing page editor (prefilled +
 * editable) via `onApplyProposal`. The mind reads and proposes; only the human
 * writes. (PRD 35 removed the moon / sub-practice offer — the mind offers no body.)
 *
 * The constitution, structurally: **consent is the gate** (off → no read, no
 * call, nothing sent; the read is also gated on a key); the **read scope is
 * exactly this one planet's own notes** (the bridge never reaches a sibling, the
 * parent star, or the galaxy); the **write wall stays sealed** — the mind writes
 * nothing; a proposal is TEXT, and the human's editor commits it through the
 * existing human-confirmed page-save. The reflection + conversation + the
 * proposal are **ephemeral** (component state, stored nowhere — closing forgets
 * them); only the consent flag persists. The raw notes blob is NEVER rendered
 * (only the mind's reflection/turns/proposed delta are) and never enters a
 * thrown/displayed string.
 *
 * Never a silent apply, never a black-box full rewrite: a proposal is shown as a
 * precise diff against the current note, and the commit is the editable editor
 * save — the safety mechanism for a notebook with no undo (PRD 35).
 *
 * Surface mirrors `CenterPanel` (the galaxy's mind): an absolute right-anchored
 * overlay (the canvas never resizes), strictly cool. One call per explicit
 * action, no retries; closing aborts any in-flight call. The Escape ladder
 * (capture phase, mounted while open): a focused modal stands it down → the
 * conversation input blurs → close.
 */
export function PlanetMindPanel({
  planetId,
  planetName,
  starName,
  apiKey,
  isConsented,
  onSetConsent,
  readNotes,
  onApplyProposal,
  onClose,
  fetchFn,
}: PlanetMindPanelProps) {
  // The reflection (the opening payoff) + where the read/reflect path stands.
  const [reflection, setReflection] = useState<string | null>(null);
  const [readState, setReadState] = useState<ReadState>("idle");
  // Bumped ONLY by the "try again" click (PRD 35.1) — the one allowed re-arm of
  // the read→reflect path. The effect depends on it, so a click re-runs the read
  // exactly once; nothing else ever changes it, so a failure can never auto-retry.
  const [retryNonce, setRetryNonce] = useState(0);

  // The conversation — ephemeral, opened on "talk about this". Alternates
  // user → assistant by construction (a converse turn commits both, or rolls
  // both back on failure).
  const [conversing, setConversing] = useState(false);
  const [transcript, setTranscript] = useState<MindMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  // The proposed note change (PRD 35) — set once "propose a change" succeeds.
  // Non-null shows the diff (a correction old→new, or an addition); the human
  // approves it into the editor or dismisses it (the note untouched). The full
  // new note text (`proposedNote`) is computed at propose-time from the private
  // notes ref and held in state — NEVER read from the ref during render (the raw
  // notes stay unreachable by any render path; only the mind's delta is shown).
  const [proposal, setProposal] = useState<PlanetNoteProposal | null>(null);
  const [proposedNote, setProposedNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  // The person's notes, joined — held ONLY to seed the conversation/distill (the
  // notes ride in the system prompt). NEVER rendered. A ref, not state, so it
  // can never be reached by a render path.
  const notesRef = useRef<string | null>(null);
  // The read/reflect runs once per consented+keyed planet; this guards it.
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
  // gate; the bridge's `readConsentedPlanetNotes` is the structural half (off →
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
        const noteList = await readNotes(planetId);
        const joined = noteList.join("\n\n").trim();
        if (joined === "") {
          setReadState("empty");
          return;
        }
        notesRef.current = joined;
        const text = await reflect(joined, apiKey, {
          fetchFn,
          signal: controller.signal,
        });
        setReflection(text);
        setReadState("ready");
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return; // a close, not an error
        // STOP in a terminal "error" state (PRD 35.1). Do NOT reset
        // `loadStartedRef` — the guard stays armed, so this state change cannot
        // re-fire the effect (no automatic retry loop, no silent billed spend).
        // Only an explicit "try again" click (`handleRetry`) re-arms the read.
        // The message is the SAFE constant (a 429 says "wait a moment and try
        // again") — never the key, never the notes.
        setReadState("error");
        setError(
          e instanceof DistillError ? e.message : "the call didn't go through",
        );
      }
    })();
  }, [isConsented, apiKey, planetId, readNotes, fetchFn, retryNonce]);

  // "try again" (PRD 35.1) — the ONLY re-arm of the read→reflect path, and only
  // ever from a human click. Reset the guard, clear the error, return to idle,
  // and bump the nonce so the effect re-runs the read exactly once.
  function handleRetry() {
    loadStartedRef.current = false;
    setError(null);
    setReadState("idle");
    setRetryNonce((n) => n + 1);
  }

  // The planet-mind Escape ladder — innermost layer first, one per press.
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

  // A "send" — one planet-converse turn (the notes ride in the system prompt).
  // The user turn is optimistic; on failure it rolls back and the text is
  // restored, so the transcript always ends on an assistant turn (or empty).
  async function handleSend() {
    if (!apiKey || busy !== null || atCap) return;
    const notes = notesRef.current;
    if (notes === null) return;
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
      const reply = await planetConverse(notes, sent, apiKey, {
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

  // "Propose a change" (PRD 35) — the person's command. The mind reads the notes
  // + the conversation and PROPOSES one note change (a correction, an addition,
  // or none), returned as TEXT. It writes nothing; the human reviews the diff and
  // commits any change in the editor.
  async function handlePropose() {
    if (!apiKey || busy !== null) return;
    const notes = notesRef.current;
    if (notes === null) return;
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
      const proposed = await planetPropose(notes, messages, apiKey, {
        fetchFn,
        signal: controller.signal,
      });
      // Apply the proposal to the current note HERE (an event handler — reading
      // the private notes ref is allowed off-render), and store the full new note
      // text in state for the editor. `null` when nothing cleanly applies
      // (kind "none", or a quoted span that isn't in the note → never a guess).
      setProposal(proposed);
      setProposedNote(applyProposal(notes, proposed));
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
      aria-label="This practice's mind"
      className="pointer-events-auto absolute inset-y-0 right-0 z-10 flex w-[34%] flex-col border-l border-haze/10 bg-abyss"
      initial={{ opacity: 0, x: "100%" }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: "100%" }}
      transition={{ duration: toSeconds(duration.base), ease: easing.cinematic }}
    >
      {/* Header — the kicker is the parent pursuit; the title is the practice. */}
      <header className="flex items-start justify-between gap-4 px-8 pb-2 pt-8">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="truncate text-[10px] font-light uppercase tracking-[0.4em] text-haze/50">
            {starName}
          </p>
          <h2 className="truncate text-base font-light tracking-wide text-starlight/90">
            {planetName}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close this practice's mind"
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
          // Consent OFF (the default): the honest invitation. NOTHING is read or
          // sent until the person turns this on — per planet, no dark pattern.
          <div className="flex flex-col gap-5">
            <p className="text-sm font-light leading-relaxed text-haze/70">
              this practice&apos;s mind is asleep. Turn it on and it will read{" "}
              <span className="text-haze/90">this practice&apos;s own notes</span>{" "}
              — nothing else — and send them to your AI provider when you open its
              mind, to offer one reflection.
            </p>
            <p className="text-[11px] font-light leading-relaxed text-haze/45">
              off by default; you can turn it back off any time. It never reads
              another practice, its pursuit, or the galaxy.
            </p>
            <button
              type="button"
              onClick={() => onSetConsent(true)}
              className={`self-start text-xs font-light uppercase tracking-[0.3em] ${ACTION_HIT} ${ACTION_PRIMARY}`}
            >
              let this practice&apos;s mind read its notes
            </button>
          </div>
        ) : (
          // Consent ON + a key: read this one practice's own notes → reflect →
          // optional conversation → offer a child.
          <>
            {readState === "loading" && (
              <p className="text-[11px] font-light tracking-wide text-haze/40">
                the mind is reading this practice&apos;s notes…
              </p>
            )}

            {readState === "empty" && (
              <p className="text-sm font-light leading-relaxed text-haze/70">
                this practice has no notes yet — the mind reflects on what
                you&apos;ve written. Add some notes (the &ldquo;notes&rdquo;
                action), then open its mind.
              </p>
            )}

            {/* The read→reflect failed (PRD 35.1) — a TERMINAL state, not a retry
                loop. The safe message (a 429 says to wait a moment), then a manual
                "try again" — the ONLY thing that re-runs the read. Strictly cool. */}
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

            {/* The conversation (PRD 33's machinery, seeded with the notes). */}
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
                        placeholder="your turn — what's on your mind about this practice?"
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
                  // The proposal — the mind PROPOSES a note change; only the human
                  // writes. Rendered as a precise diff against the current note;
                  // approving opens the editor prefilled + editable; dismissing
                  // leaves the note untouched. Never a silent apply, never a
                  // black-box full rewrite (PRD 35). Only the mind's proposed
                  // delta is shown — the raw notes blob is never rendered.
                  <NoteProposalReview
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

            {/* Honest + revocable: the mind is reading this practice; turn it off. */}
            <button
              type="button"
              onClick={() => onSetConsent(false)}
              className={`mt-2 self-start text-[10px] font-light uppercase tracking-[0.3em] ${ACTION_HIT_DENSE} ${ACTION_SECONDARY}`}
            >
              stop reading this practice
            </button>
          </>
        )}
      </div>
    </motion.aside>
  );
}

interface NoteProposalReviewProps {
  /** The mind's proposed change (PRD 35) — a correction, an addition, or none. */
  readonly proposal: PlanetNoteProposal;
  /**
   * The full new note text the editor would be prefilled with (the proposal
   * applied to the current note by the pure `applyProposal`), or `null` when
   * there is nothing to cleanly apply (kind "none", or a correction span the
   * mind quoted that isn't actually in the note — never a guessed edit).
   */
  readonly proposedNote: string | null;
  /** The HUMAN approves: hand the full new note text to the editor (a human surface). */
  readonly onApprove: (newNoteText: string) => void;
  /** Dismiss the proposal — the note is left byte-for-byte unchanged. */
  readonly onDismiss: () => void;
}

/**
 * Render a proposed note change (PRD 35) as a precise DIFF the human reviews,
 * then commits in the editor (prefilled + editable) or dismisses. This is the
 * bright line made visible: the mind proposed; the human decides, and only the
 * human writes.
 *
 *   - A correction shows the exact old span (struck through, dim) → the new text
 *     (bright) — the unmissable delta. Never the whole note (a full-replace is
 *     where a misread quietly drops a paragraph — forbidden by PRD 35).
 *   - An addition shows the new block + where it goes (appended).
 *   - When nothing cleanly applies (kind "none", or the quoted span isn't in the
 *     note), there is no diff to approve — say so honestly, offer only "keep
 *     talking".
 *
 * Only the mind's proposed delta is rendered here — never the raw notes blob.
 */
function NoteProposalReview({
  proposal,
  proposedNote,
  onApprove,
  onDismiss,
}: NoteProposalReviewProps) {
  const dismissLabel = "text-xs font-light uppercase tracking-[0.3em]";

  // Nothing cleanly applies — the honest default. No diff, no approve.
  if (proposedNote === null) {
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

  return (
    <div className="flex flex-col gap-4 border-t border-haze/10 pt-6">
      <p className="text-[10px] font-light uppercase tracking-[0.4em] text-haze/50">
        {proposal.kind === "correction"
          ? "the mind suggests a correction"
          : "the mind suggests adding"}
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
            added to the end of your notes
          </p>
        </div>
      )}

      <div className="flex items-baseline gap-6">
        {/* Approve → the EXISTING page editor, prefilled + editable; the human
            saves through the existing human-confirmed page-save. The mind writes
            nothing. */}
        <button
          type="button"
          onClick={() => onApprove(proposedNote)}
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
