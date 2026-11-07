"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

import { duration, easing, toSeconds } from "@/design/tokens";
import {
  buildDistillMessages,
  conversationAtCap,
  converse,
  DistillError,
  distillFog,
  type Distillation,
  type MindMessage,
} from "@/mind";

import {
  ACTION_DISABLED,
  ACTION_HIT,
  ACTION_HIT_DENSE,
  ACTION_PRIMARY,
  ACTION_SECONDARY,
} from "./action-tiers";
import { CreateBodyForm } from "./CreateBodyForm";

interface CenterPanelProps {
  /** The current galaxy's name — it is THIS galaxy's mind (the kicker). */
  readonly galaxyName: string;
  /**
   * The galaxy's total focused minutes — the SAME pure sum the accretion
   * ring's light derives from (`galaxyFocusedMinutes`, computed by
   * `page.tsx`). Real and derived; the panel's one honest context line.
   */
  readonly focusedMinutes: number;
  /**
   * The person's own Anthropic API key, or undefined when none is set. Used
   * ONLY as the call credential (`converse` / `distillFog`) — never rendered,
   * never logged, never placed in the DOM. No key → the gentle pointer to
   * settings (no dead input pretending to work).
   */
  readonly apiKey: string | undefined;
  /** Close the panel (also fired by the Escape ladder). */
  readonly onClose: () => void;
  /**
   * The HUMAN accepts the offer: called from the prefilled `CreateBodyForm`'s
   * submit with a name + optional description — `page.tsx` routes it into the
   * EXISTING `handleCreateStar` (and the PRD 24 glide). The mind itself never
   * creates anything; this callback is reachable only through the form.
   */
  readonly onCreatePursuit: (name: string, description: string | null) => void;
  /**
   * The injectable fetch, threaded to the mind's client (PRD 28's verification
   * boundary — the headless harness mocks HERE, so the real API is never
   * called by any test). Threaded to BOTH the converse turns and the distill
   * call. Omitted in the app → the client's real fetch.
   */
  readonly fetchFn?: typeof fetch;
}

/** What is in flight right now — a "send" (converse) or a "distill now". */
type Busy = null | "conversing" | "distilling";

/**
 * The center panel (PRD 28; conversational in PRD 33) — the black hole's
 * surface, the mind's first door. The person pours **fog** (unstructured
 * thought) and the galaxy's mind asks back: a calm **back-and-forth** where the
 * mind returns one short sharpening question per turn (`converse`, the
 * conversational client — `@/mind`, structurally sandboxed: text in, text out),
 * the person replies, and **"distill now"** — always available, the person's
 * command (the mind never decides the talk is done) — ends the conversation and
 * asks for the final **distillation**: the strongest signal + at most ONE
 * offered pursuit (the PRD 28 shape, unchanged). Accepting the offer opens the
 * existing `CreateBodyForm` prefilled — the HUMAN edits/confirms, and `page.tsx`
 * runs the existing create path + the PRD 24 glide. The mind reads and offers;
 * it never writes.
 *
 * **Cost is bounded in code, not by trust** (PRD 33): the conversation cannot
 * grow past `MAX_CONVERSATION_TURNS` mind replies — at the cap the input retires
 * and "distill now" is the only action. Converse turns use a small token budget.
 *
 * **An absolute overlay, never a flex split** (§12.13 — the canvas never
 * resizes): right-anchored over the canvas region, the in-session-notes panel's
 * family. **Strictly cool** (`abyss`/`starlight`/`haze`, `caret-haze` on the
 * input) — the whole conversation is cool; the ONLY warm element in the flow is
 * the create form's existing `caret-corona`, exactly the palette's meaning (the
 * human act of creation is warm).
 *
 * **The conversation is ephemeral** — held in component state, stored nowhere;
 * closing the panel unmounts it and the whole transcript is gone (the universe
 * keeps only what the *person* chooses to create). **Nothing fires without the
 * user's action**: no calls on mount, on typing, or in the background; one call
 * per turn, no retries. Closing aborts any in-flight call (the AbortController
 * below).
 *
 * **The Escape ladder** (capture-phase, mounted only while the panel lives, the
 * §12.11 family — one layer per press): a focused modal (the prefilled create
 * form) stands it down (the form owns its own Escape → back to the signal); the
 * conversation input focused → blur; else close. Stops immediate propagation
 * when it acts, so no other ladder also fires.
 */
export function CenterPanel({
  galaxyName,
  focusedMinutes,
  apiKey,
  onClose,
  onCreatePursuit,
  fetchFn,
}: CenterPanelProps) {
  // The conversation — ephemeral component state, stored nowhere. Alternates
  // user → assistant by construction (a converse turn commits both, or rolls
  // both back on failure).
  const [transcript, setTranscript] = useState<MindMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  // The final distillation — set once "distill now" succeeds; non-null ends the
  // talk and shows the signal + offer (the conversation input retires).
  const [signal, setSignal] = useState<Distillation | null>(null);
  // The offer's two steps: the quiet "make this a pursuit?" → the prefilled form.
  const [offerOpen, setOfferOpen] = useState(false);
  // The last safe error message (shown inline), or null.
  const [error, setError] = useState<string | null>(null);
  // Empty-input attempt → the gentle cue (the isValidBodyName manner).
  const [attempted, setAttempted] = useState(false);

  // The in-flight call's controller. Closing the panel unmounts it → abort.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  // The center-panel Escape ladder — innermost layer first, one per press.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const active = document.activeElement;
      // A focused modal owns Escape (the prefilled CreateBodyForm closes
      // itself back to the signal via its own handler) — stand down.
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

  // A "send" — one converse turn. The user turn is appended optimistically (so
  // it shows at once); on failure it is rolled back and the text restored, so
  // the transcript always ends on an assistant turn (or empty) and a retry
  // never produces two consecutive user turns. A deliberate abort (a close
  // mid-flight) is swallowed silently.
  async function handleSend() {
    if (!apiKey || busy !== null || atCap) return;
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
      const reply = await converse(sent, apiKey, {
        fetchFn,
        signal: controller.signal,
      });
      setTranscript([...sent, { role: "assistant", content: reply }]);
      setBusy(null);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return; // a close, not an error
      // Roll back the optimistic user turn; restore the text for a clean retry.
      setTranscript(transcript);
      setInput(text);
      setBusy(null);
      setError(
        e instanceof DistillError ? e.message : "the call didn't go through",
      );
    }
  }

  // "Distill now" — the person's command, available from the first turn on. The
  // distill call reads the whole transcript plus whatever is currently typed
  // (buildDistillMessages appends it, or a system cue, as the final user turn —
  // the Messages API needs a trailing user turn). One signal + at most one offer.
  async function handleDistill() {
    if (!apiKey || busy !== null) return;
    if (transcript.length === 0 && input.trim() === "") {
      setAttempted(true);
      return;
    }
    setAttempted(false);
    setError(null);
    const pending = input;
    const messages = buildDistillMessages(transcript, pending);
    setInput("");
    setOfferOpen(false);
    setBusy("distilling");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const distillation = await distillFog(messages, apiKey, {
        fetchFn,
        signal: controller.signal,
      });
      setSignal(distillation);
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
      aria-label="The galaxy's mind"
      className="pointer-events-auto absolute inset-y-0 right-0 z-10 flex w-[34%] flex-col border-l border-haze/10 bg-abyss"
      initial={{ opacity: 0, x: "100%" }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: "100%" }}
      transition={{ duration: toSeconds(duration.base), ease: easing.cinematic }}
    >
      {/* Header — the kicker is the galaxy's name: this is ITS mind. */}
      <header className="flex items-start justify-between gap-4 px-8 pb-2 pt-8">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="truncate text-[10px] font-light uppercase tracking-[0.4em] text-haze/50">
            {galaxyName}
          </p>
          <h2 className="text-base font-light tracking-wide text-starlight/90">
            the mind
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the center"
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

      {/* The one honest derived line — real persisted focus, no new math. */}
      <p className="px-8 text-[11px] font-light leading-relaxed text-haze/50">
        {focusLine(focusedMinutes)}
      </p>

      <div className="app-scroll flex flex-1 flex-col gap-6 overflow-y-auto px-8 pb-8 pt-6">
        {apiKey === undefined ? (
          // No key → say so gently and point home. No dead input.
          <p className="text-sm font-light leading-relaxed text-haze/70">
            the mind needs a key — add your Anthropic API key in settings (the
            gear, bottom right).
          </p>
        ) : (
          <>
            {/* The transcript so far — the person's turns and the mind's turns,
                both cool/neutral (warm is still earned). The mind's turns wear a
                quiet kicker and sit dimmer than the person's own words. */}
            {transcript.length > 0 && (
              <div className="flex flex-col gap-5">
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

            {signal === null ? (
              <>
                {atCap ? (
                  // The hard cap (PRD 33): the input retires gracefully and
                  // "distill now" is the only remaining action. No scold.
                  <p className="text-[11px] font-light leading-relaxed text-haze/50">
                    this is a full conversation — time to distill what we have.
                  </p>
                ) : (
                  // The input. Deliberately NOT inside a <form> (the PRD 25
                  // Escape finding). Cool caret: the conversation is not the act
                  // of creation. data-fog-input is the Escape ladder's blur hook.
                  <textarea
                    data-fog-input
                    aria-label="Your turn"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={busy !== null}
                    rows={transcript.length > 0 ? 3 : 6}
                    placeholder={
                      transcript.length > 0
                        ? "your turn — keep pouring, or distill now"
                        : "pour the fog — half-ideas, noise, whatever is circling"
                    }
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
                    onClick={() => void handleDistill()}
                    disabled={busy !== null}
                    className={`text-xs font-light uppercase tracking-[0.3em] ${ACTION_HIT} ${
                      busy !== null ? ACTION_DISABLED : ACTION_PRIMARY
                    }`}
                  >
                    {busy === "distilling" ? "distilling…" : "distill now"}
                  </button>
                  {attempted && input.trim() === "" && (
                    <p className="text-[11px] font-light tracking-wide text-haze/70">
                      the mind needs some fog first.
                    </p>
                  )}
                </div>

                {/* Errors are facts, stated quietly — and never the key. */}
                {error !== null && (
                  <p className="text-[11px] font-light tracking-wide text-haze/70">
                    {error}
                  </p>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-4 border-t border-haze/10 pt-6">
                <p className="text-[10px] font-light uppercase tracking-[0.4em] text-haze/50">
                  the signal
                </p>
                <p className="whitespace-pre-wrap text-sm font-light leading-relaxed text-starlight">
                  {signal.signal}
                </p>

                {/* The offer — the mind OFFERS; only the human creates. One
                    pursuit (the conversation's job was to converge). */}
                {signal.pursuitName !== null && !offerOpen && (
                  <button
                    type="button"
                    onClick={() => setOfferOpen(true)}
                    className={`self-start text-xs font-light uppercase tracking-[0.3em] ${ACTION_HIT} ${ACTION_PRIMARY}`}
                  >
                    make this a pursuit?
                  </button>
                )}
                {signal.pursuitName !== null && offerOpen && (
                  // The existing create form, prefilled (PRD 16's initialName)
                  // — editable, cancelable, and the one path to creation. It
                  // keeps its WARM caret: the human act of creation is warm.
                  <CreateBodyForm
                    initialName={signal.pursuitName}
                    onCreate={onCreatePursuit}
                    onCancel={() => setOfferOpen(false)}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </motion.aside>
  );
}

/**
 * The gathered-focus line — honest formatting of real minutes. Below an hour
 * it stays in minutes; above, quiet hours (one decimal until they get long).
 */
function focusLine(focusedMinutes: number): string {
  if (focusedMinutes <= 0) return "this center has not yet gathered focus";
  if (focusedMinutes < 60) {
    return `this center has gathered ${Math.round(focusedMinutes)}m of focus`;
  }
  const hours = focusedMinutes / 60;
  const shown =
    hours >= 10 ? String(Math.round(hours)) : String(Math.round(hours * 10) / 10);
  return `this center has gathered ${shown}h of focus`;
}
