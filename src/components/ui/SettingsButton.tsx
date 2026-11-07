"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { duration, easing, toSeconds } from "@/design/tokens";
import type { MotionPreference } from "@/settings";

import {
  ACTION_DESTRUCTIVE,
  ACTION_DISABLED,
  ACTION_HIT,
  ACTION_HIT_DENSE,
  ACTION_PRIMARY,
  ACTION_SECONDARY,
} from "./action-tiers";

interface SettingsButtonProps {
  /** The current motion preference (follow-system / reduce / allow). */
  readonly preference: MotionPreference;
  /** Set + persist the motion preference (PRD 15). */
  readonly onChangePreference: (preference: MotionPreference) => void;
  /**
   * Whether an Anthropic API key is stored (PRD 28). The boolean ONLY — the
   * key's value never enters this component, so it can never be echoed into
   * the DOM here.
   */
  readonly hasKey: boolean;
  /** Save a new key (PRD 28) — trimmed/validated upstream in the hook. */
  readonly onSaveKey: (key: string) => void;
  /** Forget the stored key (PRD 28). */
  readonly onClearKey: () => void;
}

interface MotionOption {
  readonly value: MotionPreference;
  readonly label: string;
  readonly hint: string;
}

/**
 * The three motion choices. "Follow system" is the default — defer to the OS
 * `prefers-reduced-motion`; the other two override it in each direction.
 */
const MOTION_OPTIONS: readonly MotionOption[] = [
  {
    value: "system",
    label: "Follow system",
    hint: "Match your device's reduced-motion setting.",
  },
  {
    value: "reduce",
    label: "Reduce motion",
    hint: "Hold the ambient drift, spin, and glide still.",
  },
  {
    value: "allow",
    label: "Allow motion",
    hint: "Keep the full cinematic motion.",
  },
];

/**
 * The settings surface (PRD 15) — a quiet bottom-right gear that opens a small
 * panel. V1 holds one control: the **motion toggle**, which lets a user force
 * reduced motion on or off regardless of their OS, or follow the system. The
 * panel is structured so a future **quality / "performance mode" toggle** slots
 * in as a second section without rework — but that toggle is deliberately NOT
 * built here (deferred; on a 1.0-DPR display a DPR-only toggle is a no-op, and a
 * non-DPR lever isn't yet justified — see PRD 15 §4 / `performance-budget.md`).
 *
 * A DOM overlay over the canvas, never inside it (`r3f-conventions.md` §12): the
 * cool/quiet, letterspaced-caps language of the other affordances; a faint void
 * scrim, never a chunky modal. Dismiss via the scrim, the "done" control, or
 * Escape (scoped to the panel via `onKeyDown`, so it doesn't collide with
 * `StarContext`'s window-level Escape). `page.tsx` mounts it when a universe is
 * ready and no focus session runs (the focus mode is sacred — §12.7).
 *
 * The panel's own fade-and-rise honors reduced motion automatically: it is
 * wrapped (in `page.tsx`) by `<MotionConfig reducedMotion>`, which drops the
 * upward slide to a plain opacity fade when motion is reduced.
 */
export function SettingsButton({
  preference,
  onChangePreference,
  hasKey,
  onSaveKey,
  onClearKey,
}: SettingsButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* The quiet gear trigger — bottom-right corner (the other corners and the
          bottom-center wordmark are taken; this one stays clear). */}
      <div className="pointer-events-none absolute bottom-0 right-0 p-8">
        <button
          type="button"
          aria-label="Settings"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className={`pointer-events-auto ${ACTION_HIT} ${ACTION_SECONDARY}`}
        >
          <GearIcon />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="settings-panel"
            className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-void/60 px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: toSeconds(duration.base), ease: easing.soft }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
          >
            <motion.div
              role="dialog"
              aria-label="Settings"
              className="flex w-80 max-w-full flex-col gap-10"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{
                duration: toSeconds(duration.slow),
                ease: easing.cinematic,
              }}
            >
              <h2 className="text-sm font-light uppercase tracking-[0.4em] text-starlight/90">
                Settings
              </h2>

              {/* Motion toggle (the only V1 setting). */}
              <fieldset className="flex flex-col gap-4 border-0 p-0">
                <legend className="mb-3 text-[10px] font-light uppercase tracking-[0.4em] text-haze">
                  Motion
                </legend>
                <div role="radiogroup" aria-label="Motion" className="flex flex-col gap-3">
                  {MOTION_OPTIONS.map((option) => {
                    const active = option.value === preference;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChangePreference(option.value)}
                        className={`group flex flex-col gap-1 text-left ${ACTION_HIT_DENSE}`}
                      >
                        <span className="flex items-center gap-3">
                          <span
                            aria-hidden
                            className={`h-1.5 w-1.5 rounded-full transition-colors duration-200 ease-soft ${
                              active ? "bg-corona" : "bg-haze/30 group-hover:bg-haze/60"
                            }`}
                          />
                          <span
                            className={`text-xs font-light tracking-wide transition-colors duration-200 ease-soft ${
                              active
                                ? "text-starlight"
                                : "text-haze/70 group-hover:text-haze"
                            }`}
                          >
                            {option.label}
                          </span>
                        </span>
                        <span className="pl-[18px] text-[11px] font-light leading-relaxed text-haze/50">
                          {option.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {/*
                The galaxy's mind (PRD 28) — the second fieldset the panel was
                built to accept (the PRD 15 seam, paid off). Masked key entry;
                once saved the key is never displayed back. The state lives in
                the child so closing the panel unmounts (and so clears) any
                half-typed key.
              */}
              <MindKeyFieldset
                hasKey={hasKey}
                onSaveKey={onSaveKey}
                onClearKey={onClearKey}
              />

              {/*
                Future: a "Quality" section (the deferred performance-mode toggle)
                still slots in here as a further <fieldset>, mirroring the blocks
                above — no rework. NOT built (see the component doc / PRD 15 §4).
              */}

              <button
                type="button"
                onClick={() => setOpen(false)}
                className={`self-start text-[11px] font-light uppercase tracking-[0.4em] ${ACTION_HIT} ${ACTION_SECONDARY}`}
              >
                done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

interface MindKeyFieldsetProps {
  readonly hasKey: boolean;
  readonly onSaveKey: (key: string) => void;
  readonly onClearKey: () => void;
}

/**
 * The galaxy's-mind fieldset (PRD 28): manage the person's own Anthropic API
 * key. The contract, structurally upheld here:
 *
 * - **Entry is masked** (`type="password"`) and the field is only ever bound
 *   to LOCAL input state — the stored key never flows back into this
 *   component (it receives only `hasKey`), so it cannot be echoed into the
 *   DOM after save.
 * - Once saved, the panel shows a quiet "a key is set" plus replace/clear —
 *   never the value.
 * - One honest caption names where the key lives and the V2 wall.
 *
 * Cool register throughout — managing a key is chrome, never an earned glow.
 */
function MindKeyFieldset({ hasKey, onSaveKey, onClearKey }: MindKeyFieldsetProps) {
  const [keyInput, setKeyInput] = useState("");
  // Replace-mode: show the entry field even though a key is already set.
  const [replacing, setReplacing] = useState(false);
  const keyId = useId();

  const entering = !hasKey || replacing;

  function handleSave() {
    const trimmed = keyInput.trim();
    if (trimmed === "") return; // gentle no-op — nothing to save
    onSaveKey(trimmed);
    setKeyInput("");
    setReplacing(false);
  }

  return (
    <fieldset className="flex flex-col gap-4 border-0 p-0">
      <legend className="mb-3 text-[10px] font-light uppercase tracking-[0.4em] text-haze">
        The galaxy&apos;s mind
      </legend>

      {entering ? (
        <div className="flex flex-col gap-2">
          <label
            htmlFor={keyId}
            className="text-[10px] font-light uppercase tracking-[0.4em] text-haze/70"
          >
            Anthropic API key
          </label>
          <input
            id={keyId}
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
            }}
            autoComplete="off"
            className="border-b border-haze/30 bg-transparent pb-2 text-sm font-light tracking-wide text-starlight caret-haze outline-none transition-colors duration-200 ease-soft focus:border-haze/80"
          />
          <div className="flex items-center gap-6 pt-1">
            <button
              type="button"
              onClick={handleSave}
              className={`text-[11px] font-light uppercase tracking-[0.3em] ${ACTION_HIT} ${
                keyInput.trim() !== "" ? ACTION_PRIMARY : ACTION_DISABLED
              }`}
            >
              save
            </button>
            {hasKey && (
              <button
                type="button"
                onClick={() => {
                  setReplacing(false);
                  setKeyInput("");
                }}
                className={`text-[11px] font-light uppercase tracking-[0.3em] ${ACTION_HIT} ${ACTION_SECONDARY}`}
              >
                cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-3">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-haze/60" />
            <span className="text-xs font-light tracking-wide text-starlight">
              a key is set
            </span>
          </span>
          <button
            type="button"
            onClick={() => setReplacing(true)}
            className={`text-[11px] font-light uppercase tracking-[0.3em] ${ACTION_HIT} ${ACTION_SECONDARY}`}
          >
            replace
          </button>
          <button
            type="button"
            onClick={onClearKey}
            className={`text-[11px] font-light uppercase tracking-[0.3em] ${ACTION_HIT} ${ACTION_DESTRUCTIVE}`}
          >
            clear
          </button>
        </div>
      )}

      <p className="text-[11px] font-light leading-relaxed text-haze/50">
        the key stays in this browser&apos;s IndexedDB, on this machine — right
        for a personal build; a shipped product would route through a backend.
      </p>
    </fieldset>
  );
}

/** A small, quiet gear glyph (currentColor so it tints with the trigger). */
function GearIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
