"use client";

import { AnimatePresence, motion } from "motion/react";

import { duration, easing, toSeconds } from "@/design/tokens";

interface WordmarkProps {
  /**
   * Whether a star is selected (the unify-polish recede condition, owned by
   * `page.tsx`). While selected the wordmark + date fully UNMOUNT (PRD 30 —
   * formerly they ghosted at low opacity and could still collide with the
   * StarContext column); they restore on deselect. Opacity-only, through the
   * page `<MotionConfig>` (reduced-motion-safe like every overlay fade).
   */
  readonly selected: boolean;
  /**
   * The universe's creation date (ISO), or null while the universe is still
   * loading — the wordmark shows alone during `loading`/`error`, exactly as
   * before the extraction.
   */
  readonly createdAt: string | null;
}

/**
 * The wordmark + "universe created" date — the bottom-center home chrome
 * (extracted verbatim from `page.tsx` in PRD 30 so the unmount rule is one
 * real, headless-assertable component). Pure presentation: no state, no
 * handlers; `page.tsx` passes the recede condition down.
 */
export function Wordmark({ selected, createdAt }: WordmarkProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-16 flex flex-col items-center">
      <AnimatePresence>
        {!selected && (
          <motion.div
            key="wordmark"
            className="flex flex-col items-center gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: toSeconds(duration.slow),
              ease: easing.cinematic,
            }}
          >
            <p className="text-xs font-light uppercase tracking-[0.4em] text-haze">
              Eclipse Brain OS
            </p>
            {createdAt !== null && (
              <p className="text-[10px] font-light text-haze/60">
                universe created {new Date(createdAt).toLocaleDateString()}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
