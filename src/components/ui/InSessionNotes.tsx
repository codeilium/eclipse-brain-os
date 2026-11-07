"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { duration, easing, toSeconds } from "@/design/tokens";
import { usePage } from "@/persistence";
import type { PlanetId } from "@/universe";

import { ACTION_HIT_DENSE, ACTION_SECONDARY, STATUS_CUE } from "./action-tiers";
import { PageNotesBody, statusLabel } from "./PageNotesBody";

interface InSessionNotesProps {
  /**
   * The sessioned practice's id — the running session's `targetId` (always a
   * planet in V1; moons aren't directly focusable). `page.tsx` resolves it from
   * the running session (`focusTarget.planet.id`) and passes it down; this
   * component only **reads** it — it never touches session state. Drives
   * `usePage(bodyId)`: the **same** note the dock opens for this body.
   */
  readonly bodyId: PlanetId;
  /** The practice's name — the panel header's title. */
  readonly bodyName: string;
}

/**
 * In-session notes (PRD 20) — a thin slide-out tab, present **only while a focus
 * session runs**, that reveals the **sessioned practice's own page** without ever
 * leaving focus. It reuses the page, it does not fork it: the same
 * `usePage(bodyId)` note, the same PRD 18/19 read/edit toggle + markdown rendering
 * (the shared `PageNotesBody`), reached through a new door (this tab) instead of
 * the full split dock — one note, one save path, two doors.
 *
 * **The session is never interrupted.** This component only *reads* the sessioned
 * body's id (a prop) and renders a notes surface; it never touches
 * `runningSession`, the timer, the completion effect, or `commitCompletedSession`.
 * The `<FocusSession>` overlay (the countdown) stays mounted and visible the whole
 * time — this is an **absolute overlay layered over the focus scrim, NOT a flex
 * sibling like the dock**, so the canvas never resizes mid-session (calm, and no
 * Vega 8 resize thrash — the dock's split is exactly what PRD 18 closed for a
 * session). The panel is **narrower than the dock** (`w-[34%]` vs `44%`) and
 * right-anchored so the **centered countdown stays clear** — if the panel would
 * reach the timer, the timer wins (made structural by the width).
 *
 * **Editable while the timer runs.** `usePage` lives here, mounted for the whole
 * session, so typing autosaves through the same debounce and the pending edit
 * flushes when the session ends (the hook flushes on unmount). If the dock had
 * this body's page open, it already flushed + unmounted when the session started
 * (`handleBeginFocus`), so the note is continuous: edit here, and it's the same
 * note in the dock after the session.
 *
 * **Warm = earned (§7):** the tab + panel are cool/neutral (`abyss` surface,
 * `haze`/`starlight`, a cool caret, links a cool amethyst via `MarkdownView`),
 * never warm. The slide runs through the page `<MotionConfig>` → reduced motion
 * drops it to a plain show/hide. An empty page opens ready to write (placeholder).
 *
 * **Escape never ends the session (§6).** A capture-phase listener peels one layer
 * per press: editing → read (blur the `data-page-editor` textarea), then open →
 * closed; when closed, Escape does nothing (the session is untouched). It coexists
 * trivially with PRD 18's dock listener, which is dormant during a session (gated
 * on the dock being open, and the dock can't open mid-session).
 */
export function InSessionNotes({ bodyId, bodyName }: InSessionNotesProps) {
  const [notesOpen, setNotesOpen] = useState(false);

  // The SAME page the dock opens (PRD 17/18) — one note, one save path. Mounted
  // for the whole session, so autosave is continuous and the pending edit flushes
  // when the session ends (the hook flushes on unmount).
  const { content, save, status } = usePage(bodyId);
  const cue = statusLabel(status);

  // The in-session Escape ladder — peels one layer per press and NEVER ends the
  // session (focus is the one true mode; leaving is a deliberate action, §12.7).
  // Capture-phase + stopImmediatePropagation when it acts, mirroring the dock's
  // §12.12 ladder; coexists trivially with PRD 18's listener (dormant in-session).
  //  1. Editing (the body's textarea, `data-page-editor`, focused): blur it (its
  //     onBlur re-renders the read view) → exit to read; the panel stays open.
  //  2. Notes open (read mode): close the notes; the session keeps running.
  //  3. Notes closed: do NOTHING — Escape must never end a focus session.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        active.matches("textarea[data-page-editor]")
      ) {
        active.blur();
        e.stopImmediatePropagation();
        return;
      }
      if (!notesOpen) return; // closed → leave the session untouched
      setNotesOpen(false);
      e.stopImmediatePropagation();
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [notesOpen]);

  return (
    <>
      {/* The tab — a quiet handle on the right edge, present only while a session
          runs. Tapping it opens the notes. Cool/neutral, opaque (no warm leak).
          Hidden while the panel is open (the panel's chevron / Escape close it). */}
      <AnimatePresence>
        {!notesOpen && (
          <motion.button
            key="notes-tab"
            type="button"
            onClick={() => setNotesOpen(true)}
            aria-label="Open notes"
            className={`pointer-events-auto absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-l-md border border-r-0 border-haze/10 bg-abyss py-4 pl-3 pr-2.5 ${ACTION_SECONDARY}`}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: toSeconds(duration.base), ease: easing.soft }}
          >
            <span className="text-[10px] font-light uppercase tracking-[0.3em] [writing-mode:vertical-rl]">
              notes
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* The slide-out panel — the SAME notes surface as the dock (PageNotesBody),
          reached through the tab instead of the split. An absolute overlay (never
          a flex sibling), so the canvas does not resize. Slides via x through the
          page <MotionConfig> → reduced motion drops the slide to a plain fade. */}
      <AnimatePresence>
        {notesOpen && (
          <motion.aside
            key="notes-panel"
            className="pointer-events-auto absolute inset-y-0 right-0 z-10 flex w-[34%] flex-col border-l border-haze/10 bg-abyss"
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ duration: toSeconds(duration.base), ease: easing.cinematic }}
          >
            {/* Header — echoes the dock: kicker + name, the save cue, a close
                chevron. The kicker is always "Practice" (a session targets a
                planet in V1). Cool/neutral. */}
            <header className="flex items-start justify-between gap-4 px-8 pb-5 pt-8">
              <div className="flex min-w-0 flex-col gap-2">
                <p className="text-[10px] font-light uppercase tracking-[0.4em] text-haze/50">
                  Practice
                </p>
                <h2 className="truncate text-base font-light tracking-wide text-starlight/90">
                  {bodyName}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span
                  aria-live="polite"
                  className={`text-[10px] font-light uppercase tracking-[0.3em] ${STATUS_CUE}`}
                >
                  {cue}
                </span>
                <button
                  type="button"
                  onClick={() => setNotesOpen(false)}
                  aria-label="Close notes"
                  className={`${ACTION_HIT_DENSE} ${ACTION_SECONDARY}`}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M6 4l4 4-4 4"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </header>

            {/* The shared notes body — the same read/edit toggle + rendering as the
                dock (PRD 18/19), bound to this session's `usePage`. */}
            <PageNotesBody bodyId={bodyId} content={content} save={save} />
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
