"use client";

import { motion } from "motion/react";

import { duration, easing, toSeconds } from "@/design/tokens";

import { ACTION_DESTRUCTIVE, ACTION_HIT } from "./action-tiers";
import { formatDuration } from "./focus-timer";

interface FocusSessionProps {
  /**
   * Milliseconds remaining, computed by `page.tsx` from the session's start
   * timestamp vs wall-clock `now` (the timestamp is the source of truth; this
   * is just a render of it — r3f-conventions.md §12.7). Reaches 0 at completion.
   */
  readonly remainingMs: number;
  /** The practice (planet) being focused on — the thing you're working on. */
  readonly practiceName: string;
  /** Its parent star (pursuit) — context for the practice. */
  readonly starName: string;
  /**
   * Ends the session immediately with no orbit progress (completion is the
   * unit; a partial session earns nothing). `page.tsx` clears the running
   * state; the sky un-quiets as this overlay fades out. There is no pause.
   */
  readonly onAbandon: () => void;
}

/**
 * The focus-session overlay — the **one justified mode** in Eclipse Brain OS
 * (r3f-conventions.md §12.7). We resisted modes elsewhere (selection stayed
 * minimal in PRD 10), but focusing is genuinely a distinct state of being: a
 * 25-minute commitment is running, so the rest of the universe is allowed to
 * recede and the work to take center.
 *
 * The full-screen backdrop is a faint `void` scrim — this *is* the sky-quieting
 * (done purely in the DOM, so the canvas stays untouched and props-driven). It
 * is gentle and reversible: it dims the whole sky a little rather than hiding
 * anything, and the focused planet — the warmest body — stays the most legible
 * thing showing through. The scrim is **non-dismissing** (a stray click can't
 * end a commitment); the only way out is the quiet *abandon* affordance or
 * genuine completion.
 *
 * Purely presentational: the countdown is `formatDuration(remainingMs)`, the
 * tick + completion + commit all live in `page.tsx`. A DOM overlay over the
 * canvas, never inside it (§12.1).
 */
export function FocusSession({
  remainingMs,
  practiceName,
  starName,
  onAbandon,
}: FocusSessionProps) {
  return (
    <motion.div
      className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-16 bg-void/55 px-6 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: toSeconds(duration.slow), ease: easing.cinematic }}
    >
      <motion.div
        className="flex flex-col items-center gap-12"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: toSeconds(duration.slow), ease: easing.cinematic }}
      >
        {/* Context — the practice you're working on, and its pursuit. */}
        <div className="flex flex-col items-center gap-2">
          <p className="max-w-md truncate text-lg font-light tracking-wide text-starlight/90">
            {practiceName}
          </p>
          <p className="max-w-md truncate text-xs font-light tracking-[0.2em] text-haze/60">
            in {starName}
          </p>
        </div>

        {/* The countdown — the emotional center. Tabular figures so the digits
            don't jitter as the seconds tick. */}
        <p className="text-7xl font-extralight tabular-nums tracking-[0.05em] text-starlight sm:text-8xl">
          {formatDuration(remainingMs)}
        </p>
      </motion.div>

      {/* Abandon — quiet and easy to ignore until needed. No penalty beyond
          no-progress (lenient + trust-based). No pause, by design. */}
      <button
        type="button"
        onClick={onAbandon}
        className={`text-[11px] font-light uppercase tracking-[0.4em] ${ACTION_HIT} ${ACTION_DESTRUCTIVE}`}
      >
        abandon
      </button>
    </motion.div>
  );
}
