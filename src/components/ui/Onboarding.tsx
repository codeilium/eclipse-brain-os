"use client";

import { motion } from "motion/react";

import { duration, easing, toSeconds } from "@/design/tokens";

import { CreateBodyForm } from "./CreateBodyForm";

interface OnboardingProps {
  readonly onCreate: (name: string, description: string | null) => void;
}

/**
 * The empty-universe invitation — the first thing a person sees in a brand-new
 * universe. Not an empty state to apologize for: the dark sky is the truthful
 * starting condition, and the copy frames the soon-to-be-dim first star as
 * potential, not emptiness ("a faint ember; tend it and it will shine").
 *
 * A DOM overlay layered over the (atmosphere-only) canvas — never inside it.
 * Fades and rises in via the motion tokens; nothing bouncy. The void shows
 * through around it.
 */
export function Onboarding({ onCreate }: OnboardingProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
      <motion.div
        className="pointer-events-auto flex max-w-md flex-col items-center gap-12 text-center"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: toSeconds(duration.slow), ease: easing.cinematic }}
      >
        <div className="flex flex-col gap-4">
          <h1 className="text-sm font-light uppercase tracking-[0.4em] text-starlight/90">
            What are you pursuing?
          </h1>
          <p className="max-w-sm text-xs font-light leading-relaxed tracking-wide text-haze">
            This is your universe — dark, and waiting. Name your first pursuit
            and it will appear as a faint ember. Tend it, and it will begin to
            shine.
          </p>
        </div>
        <CreateBodyForm onCreate={onCreate} />
      </motion.div>
    </div>
  );
}
