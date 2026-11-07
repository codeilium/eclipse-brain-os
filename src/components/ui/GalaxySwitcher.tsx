"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { duration, easing, toSeconds } from "@/design/tokens";
import type { Galaxy, GalaxyId } from "@/universe";

import {
  ACTION_HIT,
  ACTION_HIT_DENSE,
  ACTION_PRIMARY,
  ACTION_SECONDARY,
} from "./action-tiers";
import { CreateBodyForm } from "./CreateBodyForm";

interface GalaxySwitcherProps {
  /** Every galaxy in the universe, in creation order (read-only — names only). */
  readonly galaxies: ReadonlyArray<Galaxy>;
  /** The galaxy currently on screen — marked in the list, named in the chrome. */
  readonly currentGalaxyId: GalaxyId;
  /** Switch the sky (PRD 27) — `page.tsx` owns what a switch means. */
  readonly onSwitch: (galaxyId: GalaxyId) => void;
  /** Create a galaxy and arrive on it — `page.tsx` runs the mutator + switch. */
  readonly onCreate: (name: string) => void;
  /** Rename a galaxy (label-only by construction — `editGalaxyDetails`). */
  readonly onRename: (galaxyId: GalaxyId, name: string) => void;
}

/** Which face the panel is showing: the list, a rename form, or the create form. */
type PanelMode =
  | { readonly kind: "list" }
  | { readonly kind: "rename"; readonly galaxyId: GalaxyId }
  | { readonly kind: "create" };

const LIST_MODE: PanelMode = { kind: "list" };

/**
 * The galaxy switcher (PRD 27) — many skies, one heart each.
 *
 * The current galaxy's name sits in the top-left chrome as a quiet,
 * always-visible truth (multi-galaxy is only legible if you can see *which sky
 * you're in*); clicking it opens a small anchored panel — the settings-panel
 * pattern (scrim + a calm card), NOT a third slide-out drawer — listing every
 * galaxy by name (the current one marked quietly), each row hover-revealing a
 * rename affordance (the §12.9 idiom), with "+ new galaxy" at the bottom.
 * Rename/create reuse `CreateBodyForm` in name-only mode (a `Galaxy` stores no
 * description — never collect what isn't stored) with a cool caret.
 *
 * Switching is a CONTEXT change, not a camera move — `page.tsx` re-keys the
 * scene subtree and explicitly clears the old sky's selection/dock/catalog;
 * picking the galaxy you're already in just closes the panel (nothing to
 * clear, no remount). Read-only of the universe: this renders names and
 * reports intents up; the mutators live behind `page.tsx`.
 *
 * **Warm = earned, strictly:** chrome + panel are cool/neutral (`abyss`,
 * `starlight`/`haze`, a `caret-haze` form caret, the current-galaxy dot is
 * haze) — a switcher is furniture, never an earned glow.
 *
 * **Escape** (the §12.11 capture-phase idiom, mounted only while open): one
 * press peels one layer — a focused rename/create form inside the panel
 * returns to the list; a focused *foreign* modal stands the listener down;
 * otherwise the panel closes — and `stopImmediatePropagation` keeps
 * StarContext's bubble deselect (and the other ladders) from also firing.
 * `page.tsx` gates the whole component off while a session runs (focus is the
 * one true mode), so a mid-session switch is impossible by construction.
 */
export function GalaxySwitcher({
  galaxies,
  currentGalaxyId,
  onSwitch,
  onCreate,
  onRename,
}: GalaxySwitcherProps) {
  const [open, setOpen] = useState(false);
  // The mode resets on close (the catalog's filter-resets-on-close rule): a
  // reopened panel always greets with the list, never a stale half-typed form.
  const [mode, setMode] = useState<PanelMode>(LIST_MODE);
  const panelRef = useRef<HTMLDivElement>(null);

  const currentGalaxy =
    galaxies.find((g) => g.id === currentGalaxyId) ?? galaxies[0];

  function close() {
    setOpen(false);
    setMode(LIST_MODE);
  }

  // The switcher Escape layer — capture-phase, mounted only while open. Layers,
  // innermost first: (1) our own rename/create form focused → back to the list
  // (the dock-ladder idiom of peeling the owned inner layer at capture phase);
  // (2) a focused FOREIGN form/dialog owns Escape → stand down; (3) otherwise
  // close the panel. Each handled press stops there (one press, one layer).
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        panelRef.current?.contains(active) &&
        active.closest("form")
      ) {
        setMode(LIST_MODE);
        e.stopImmediatePropagation();
        return;
      }
      if (active?.closest("form, [role='alertdialog'], [role='dialog']")) {
        return;
      }
      close();
      e.stopImmediatePropagation();
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open]);

  // A row click is one gesture: the panel recedes and the sky answers. The
  // current galaxy's row just closes — re-picking where you already are must
  // not clear selection or remount the sky.
  function pick(galaxyId: GalaxyId) {
    close();
    if (galaxyId !== currentGalaxyId) onSwitch(galaxyId);
  }

  const renameTarget =
    mode.kind === "rename"
      ? galaxies.find((g) => g.id === mode.galaxyId) ?? null
      : null;

  return (
    <>
      {/* The chrome line — the current galaxy's name, a quiet always-visible
          truth in the top-left corner ("+ new pursuit" sits below it). Cool;
          hover/focus reveal it as a click target. */}
      <div className="pointer-events-none absolute left-0 top-0 p-8">
        <button
          type="button"
          aria-label="Galaxies"
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className={`pointer-events-auto text-[11px] font-light uppercase tracking-[0.4em] ${ACTION_HIT} ${ACTION_SECONDARY}`}
        >
          {currentGalaxy?.name}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="galaxy-panel"
            className="pointer-events-auto absolute inset-0 z-10 bg-void/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: toSeconds(duration.base), ease: easing.soft }}
            onClick={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            {/* The anchored panel — a small calm card under the chrome line,
                NOT a centered modal and NOT a dialog role (a dialog would make
                the Escape ladders defer to it, §12.11). Opaque abyss surface. */}
            <motion.div
              ref={panelRef}
              aria-label="Galaxies"
              className="absolute left-8 top-16 flex w-72 max-w-[calc(100%-4rem)] flex-col gap-6 rounded-md border border-haze/10 bg-abyss p-6"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{
                duration: toSeconds(duration.slow),
                ease: easing.cinematic,
              }}
            >
              {mode.kind === "list" && (
                <>
                  <h2 className="text-[10px] font-light uppercase tracking-[0.4em] text-haze">
                    Galaxies
                  </h2>
                  <ul className="flex flex-col gap-3">
                    {galaxies.map((galaxy) => {
                      const current = galaxy.id === currentGalaxyId;
                      return (
                        <li
                          key={galaxy.id}
                          className="group flex items-center justify-between gap-4"
                        >
                          <button
                            type="button"
                            aria-current={current ? "true" : undefined}
                            onClick={() => pick(galaxy.id)}
                            className={`flex min-w-0 items-center gap-3 text-left ${ACTION_HIT_DENSE}`}
                          >
                            <span
                              aria-hidden
                              className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-200 ease-soft ${
                                current ? "bg-haze/80" : "bg-haze/20 group-hover:bg-haze/40"
                              }`}
                            />
                            <span
                              className={`truncate text-xs font-light tracking-wide transition-colors duration-200 ease-soft ${
                                current
                                  ? "text-starlight"
                                  : "text-haze/70 group-hover:text-haze"
                              }`}
                            >
                              {galaxy.name}
                            </span>
                          </button>
                          {/* Hover/focus-revealed rename (§12.9) — a label fix,
                              never a path to anything earned. */}
                          <button
                            type="button"
                            onClick={() =>
                              setMode({ kind: "rename", galaxyId: galaxy.id })
                            }
                            className={`text-[10px] font-light uppercase tracking-[0.3em] ${ACTION_HIT_DENSE} text-haze/60 opacity-0 transition-[color,opacity] duration-200 ease-soft hover:text-haze focus-visible:text-haze focus-visible:opacity-100 group-hover:opacity-100`}
                          >
                            rename
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setMode({ kind: "create" })}
                    className={`self-start text-[11px] font-light uppercase tracking-[0.3em] ${ACTION_HIT} ${ACTION_PRIMARY}`}
                  >
                    + new galaxy
                  </button>
                </>
              )}

              {mode.kind === "rename" && renameTarget && (
                <>
                  <h2 className="text-[10px] font-light uppercase tracking-[0.4em] text-haze">
                    Rename galaxy
                  </h2>
                  <CreateBodyForm
                    nameOnly
                    coolCaret
                    initialName={renameTarget.name}
                    submitLabel="Save"
                    nameHint="A galaxy needs a name."
                    onCreate={(name) => {
                      onRename(renameTarget.id, name);
                      setMode(LIST_MODE);
                    }}
                    onCancel={() => setMode(LIST_MODE)}
                  />
                </>
              )}

              {mode.kind === "create" && (
                <>
                  <h2 className="text-[10px] font-light uppercase tracking-[0.4em] text-haze">
                    New galaxy
                  </h2>
                  <CreateBodyForm
                    nameOnly
                    coolCaret
                    submitLabel="Begin"
                    nameHint="A galaxy needs a name."
                    onCreate={(name) => {
                      close();
                      onCreate(name);
                    }}
                    onCancel={() => setMode(LIST_MODE)}
                  />
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
