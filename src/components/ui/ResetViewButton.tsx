"use client";

import { motion } from "motion/react";

import { duration, easing, toSeconds } from "@/design/tokens";

import { ACTION_HIT, ACTION_SECONDARY } from "./action-tiers";

interface ResetViewButtonProps {
  /** Trigger a camera reset-view glide back to the default framing (PRD 13). */
  readonly onReset: () => void;
}

/**
 * The quiet "reset view" affordance (PRD 13). Once the camera is user-movable,
 * the universe can be panned/zoomed away from its default framing; this returns
 * it — smoothly (the camera glides, never snaps; the actual animation lives in
 * `Camera.tsx`). "Limits are findability, not restriction": with clamped
 * zoom/pan plus this reset, the populated sky is always reachable.
 *
 * A restrained letterspaced-caps corner trigger, matching `NewPursuitButton` —
 * cool/quiet, never warm, never a chunky button. A DOM overlay over the canvas,
 * never inside it (`r3f-conventions.md` §12). `page.tsx` mounts it only when a
 * universe exists and no focus session is running (the camera is locked during
 * a session, so reset is withheld then too).
 */
export function ResetViewButton({ onReset }: ResetViewButtonProps) {
  return (
    <motion.div
      className="pointer-events-none absolute right-0 top-0 p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: toSeconds(duration.slow), ease: easing.cinematic }}
    >
      <button
        type="button"
        onClick={onReset}
        className={`pointer-events-auto text-[11px] font-light uppercase tracking-[0.4em] ${ACTION_HIT} ${ACTION_SECONDARY}`}
      >
        reset view
      </button>
    </motion.div>
  );
}
