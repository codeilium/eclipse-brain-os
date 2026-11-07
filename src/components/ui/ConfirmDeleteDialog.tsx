"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";

import { duration, easing, toSeconds } from "@/design/tokens";
import type { SubtreeCounts } from "@/universe";

import { ACTION_DESTRUCTIVE, ACTION_HIT, ACTION_SECONDARY } from "./action-tiers";

interface ConfirmDeleteDialogProps {
  /** The body being deleted — named in the prompt so the cost is explicit. */
  readonly name: string;
  /**
   * The descendant counts (from `describeSubtree`) — so the prompt can name the
   * cascade honestly ("…and its 3 practices and 5 sub-practices"). A leaf (moon)
   * passes `{ planets: 0, moons: 0 }` and no cascade clause is shown.
   */
  readonly cascade: SubtreeCounts;
  /** Confirm the delete — the parent runs the delete mutator + persists. */
  readonly onConfirm: () => void;
  /** Dismiss without deleting (the Cancel control, the scrim, or panel Escape). */
  readonly onCancel: () => void;
}

/** "3 practices and 5 sub-practices" — pluralized, zero clauses omitted. */
function cascadeClause({ planets, moons }: SubtreeCounts): string {
  const parts: string[] = [];
  if (planets > 0) {
    parts.push(`${planets} ${planets === 1 ? "practice" : "practices"}`);
  }
  if (moons > 0) {
    parts.push(`${moons} ${moons === 1 ? "sub-practice" : "sub-practices"}`);
  }
  return parts.join(" and ");
}

/**
 * The delete confirmation (PRD 16) — a quiet two-step that names exactly what
 * will be removed, including the cascade, so no one loses more than they clicked.
 * Honest, not mournful: the friction is "make sure you meant it," never guilt, no
 * melodrama, no alarm-red (the palette has none — warmth is earned, not spent).
 *
 * Matches the SettingsButton scrim/panel language (`r3f-conventions.md` §12.3/§12.8):
 * a faint void scrim, a centered fade-and-rise panel (the rise is dropped to a
 * plain fade under reduced motion by the page-level `<MotionConfig>`). Dismiss via
 * Cancel, the scrim, or **panel-scoped Escape** — an `onKeyDown`, never a window
 * listener, so it can't collide with `StarContext`'s window Escape (the §12.8 rule).
 * The panel takes focus on open so Escape works immediately and no button is
 * pre-armed (a hasty Enter can't confirm a destructive action).
 *
 * Presentation only — mounted by the affordance components inside an
 * `<AnimatePresence>`; the mutation lives in `page.tsx` (§12.2).
 */
export function ConfirmDeleteDialog({
  name,
  cascade,
  onConfirm,
  onCancel,
}: ConfirmDeleteDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const clause = cascadeClause(cascade);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <motion.div
      className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-void/60 px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: toSeconds(duration.base), ease: easing.soft }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <motion.div
        ref={panelRef}
        role="alertdialog"
        aria-label="Confirm delete"
        tabIndex={-1}
        className="flex w-80 max-w-full flex-col gap-10 outline-none"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: toSeconds(duration.slow), ease: easing.cinematic }}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm font-light leading-relaxed tracking-wide text-haze">
            Delete <span className="text-starlight/90">{name}</span>
            {clause.length > 0 && <> and its {clause}</>}?
          </p>
          <p className="text-[11px] font-light tracking-wide text-haze/50">
            This can&rsquo;t be undone.
          </p>
        </div>

        <div className="flex items-center gap-8 pt-2">
          <button
            type="button"
            onClick={onConfirm}
            className={`text-xs font-light uppercase tracking-[0.3em] ${ACTION_HIT} ${ACTION_DESTRUCTIVE}`}
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onCancel}
            className={`text-xs font-light uppercase tracking-[0.3em] ${ACTION_HIT} ${ACTION_SECONDARY}`}
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
