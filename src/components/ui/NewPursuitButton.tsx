"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { duration, easing, toSeconds } from "@/design/tokens";

import { ACTION_HIT, ACTION_PRIMARY } from "./action-tiers";
import { CreateBodyForm } from "./CreateBodyForm";

interface NewPursuitButtonProps {
  readonly onCreate: (name: string, description: string | null) => void;
  /**
   * Recede the trigger while a star is selected (the unify polish): the home
   * chrome fades back so the screen reconfigures from *home* to *this star*. The
   * trigger animates opacity → 0 and goes non-interactive (kept mounted, so the
   * fade is smooth both ways); restored (→ 1) on deselect. Driven through the
   * page-level `<MotionConfig>`, so it's reduced-motion-safe.
   */
  readonly receded?: boolean;
}

/**
 * The persistent "+ new pursuit" affordance, shown once at least one star
 * exists. A quiet letterspaced trigger tucked in a corner — unobtrusive, never
 * centered, never competing with the bodies. Clicking it opens the shared
 * `CreateBodyForm` as a restrained centered moment (a faint void scrim, not a
 * chunky modal — the star field still shows through). After creation, or on
 * cancel / Escape / scrim-click, it returns to the quiet trigger.
 *
 * A DOM overlay over the canvas — never inside it (`r3f-conventions.md` §12).
 */
export function NewPursuitButton({
  onCreate,
  receded = false,
}: NewPursuitButtonProps) {
  const [open, setOpen] = useState(false);

  function handleCreate(name: string, description: string | null) {
    onCreate(name, description);
    setOpen(false);
  }

  return (
    <>
      <motion.div
        // pt-16: the trigger sits one step below the galaxy switcher's chrome
        // line (PRD 27) — "where am I" reads first, the action second.
        className="pointer-events-none absolute left-0 top-0 p-8 pt-16"
        initial={false}
        animate={{ opacity: receded ? 0 : 1 }}
        transition={{ duration: toSeconds(duration.slow), ease: easing.cinematic }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`text-[11px] font-light uppercase tracking-[0.4em] ${ACTION_HIT} ${ACTION_PRIMARY} ${
            receded ? "pointer-events-none" : "pointer-events-auto"
          }`}
        >
          + new pursuit
        </button>
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="new-pursuit-form"
            className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-void/60 px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: toSeconds(duration.base), ease: easing.soft }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{
                duration: toSeconds(duration.slow),
                ease: easing.cinematic,
              }}
            >
              <CreateBodyForm
                onCreate={handleCreate}
                onCancel={() => setOpen(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
