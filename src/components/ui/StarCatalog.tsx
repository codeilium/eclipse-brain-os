"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { duration, easing, toSeconds } from "@/design/tokens";
import type { Star, StarId } from "@/universe";

import {
  ACTION_HIT_DENSE,
  ACTION_PRIMARY,
  ACTION_SECONDARY,
} from "./action-tiers";
import { filterCatalog } from "./catalog";

interface StarCatalogProps {
  /** Every star in the universe (read-only — the catalog never mutates it). */
  readonly stars: ReadonlyArray<Star>;
  /**
   * Navigate to a star: `page.tsx` selects it AND fires the camera fly-to
   * glide at its position (the PRD 24 creation glide, aimed at a star you
   * already own). A practice row passes its *star's* id — the default-overview
   * framing shows the whole system, so landing on the star is landing on the
   * practice too.
   */
  readonly onNavigate: (starId: StarId) => void;
}

/**
 * The star catalog (PRD 25) — find a star by **name**, not by panning. A quiet
 * slide-out panel (the PRD 20 in-session-notes tab pattern, **left-anchored**)
 * listing every star alphabetically with its practices nested, behind one
 * small filter; clicking any row closes the panel, selects that star, and
 * glides the camera to it.
 *
 * **UI-only, read-only of the universe.** It renders names and reports a
 * navigate *up* — no model/persistence/schema change, no `localStorage`, and
 * **zero camera code**: the glide is PRD 24's existing fly-to, fired by
 * `page.tsx`'s handler. `page.tsx` gates the mount honestly — hidden at 0
 * stars (nothing to catalog) and during a focus session (focus is the one
 * true mode, §12.7; the camera is locked then anyway), the same protection
 * model as the withheld reset affordance.
 *
 * **An absolute overlay, NOT a flex split** (the §12.13 rule): the panel
 * layers over the canvas region's left edge, so the canvas never resizes —
 * unlike the dock's deliberate split, browsing the catalog is a glance, not a
 * mode. The slide runs via an `x` transform through the page-level
 * `<MotionConfig>` → **reduced motion drops it to a plain show/hide**.
 *
 * **The filter** is one quiet underlined input (§12.3) whose brain is the
 * pure, unit-tested `filterCatalog` (`catalog.ts`): case-insensitive
 * substring over star + practice names; a name-matched star shows all its
 * practices, a practice-matched star only the matching ones; empty query =
 * everything. Only the *stars* are sorted (alphabetically — that is the
 * catalog's promise); practices keep their natural order, matching
 * `StarContext`'s list. The input is deliberately **not** wrapped in a
 * `<form>` — the Escape ladders' modal stand-down checks `closest("form")`,
 * and a form-wrapped filter would make Escape dead here. It autofocuses on
 * open, so typing filters instead of panning (the keyboard camera stands
 * down for focused form fields, §8.1).
 *
 * **Escape peels one layer (§12.11–§12.13).** A capture-phase window
 * listener, mounted **only while the catalog is open**: a focused modal
 * (form/dialog) still owns Escape (stand down); otherwise close the catalog +
 * `stopImmediatePropagation` so `StarContext`'s bubble deselect doesn't also
 * fire. Closed → no listener at all, so the dock's ladder and the in-session
 * notes ladder are untouched (the notes tab can never coexist — opposite
 * session gates).
 *
 * **Warm = earned (§7), strictly:** tab + panel are cool/neutral (`abyss`
 * surface, `starlight`/`haze` text, a `caret-haze` filter caret — never the
 * create form's warm `caret-corona`). The only warm thing remains the real
 * star on the canvas.
 */
export function StarCatalog({ stars, onNavigate }: StarCatalogProps) {
  const [open, setOpen] = useState(false);
  // The filter resets on close (not kept across open/close): a stale filter
  // silently hiding stars on reopen would read as lost data. Fresh each look.
  const [query, setQuery] = useState("");

  // Alphabetical stars (the catalog's promise; case-insensitive), each with
  // the practices the filter says to show. Filtering is the pure helper;
  // ordering is presentation, so it lives here.
  const entries = useMemo(
    () =>
      [...filterCatalog(stars, query)].sort((a, b) =>
        a.star.name.localeCompare(b.star.name, undefined, {
          sensitivity: "base",
        }),
      ),
    [stars, query],
  );

  // The catalog Escape layer — capture-phase, mounted only while open. A
  // focused form/dialog still owns Escape (the §12.11 modal stand-down);
  // otherwise one press closes the catalog and stops there (StarContext's
  // bubble deselect must not also fire). The filter input is NOT a modal —
  // Escape closes the catalog from inside it too.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (
        document.activeElement?.closest(
          "form, [role='alertdialog'], [role='dialog']",
        )
      ) {
        return;
      }
      setOpen(false);
      setQuery("");
      e.stopImmediatePropagation();
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  // A row click is one gesture: the panel recedes and the universe answers
  // (selection + the glide). page.tsx owns what "navigate" means.
  function navigate(starId: StarId) {
    close();
    onNavigate(starId);
  }

  return (
    <>
      {/* The tab — a quiet handle on the left edge (the mirror of the notes
          tab), present whenever the catalog exists. Hidden while the panel is
          open (the panel's chevron / Escape close it). Cool/neutral. */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="catalog-tab"
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open the star catalog"
            className={`pointer-events-auto absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-r-md border border-l-0 border-haze/10 bg-abyss py-4 pl-2.5 pr-3 ${ACTION_SECONDARY}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: toSeconds(duration.base), ease: easing.soft }}
          >
            <span className="text-[10px] font-light uppercase tracking-[0.3em] [writing-mode:vertical-rl]">
              catalog
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* The slide-out panel — an absolute overlay over the canvas region's
          left edge (never a flex split; the canvas does not resize). Slides
          via x through the page <MotionConfig> → reduced motion drops the
          slide to a plain show/hide. */}
      <AnimatePresence>
        {open && (
          <motion.aside
            key="catalog-panel"
            className="pointer-events-auto absolute inset-y-0 left-0 z-10 flex w-[30%] flex-col border-r border-haze/10 bg-abyss"
            initial={{ opacity: 0, x: "-100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "-100%" }}
            transition={{ duration: toSeconds(duration.base), ease: easing.cinematic }}
          >
            {/* Header — the kicker + a close chevron (pointing back off-screen).
                Echoes the notes panel's header, mirrored. */}
            <header className="flex items-center justify-between gap-4 px-8 pb-4 pt-8">
              <p className="text-[10px] font-light uppercase tracking-[0.4em] text-haze/50">
                Catalog
              </p>
              <button
                type="button"
                onClick={close}
                aria-label="Close the star catalog"
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
                    d="M10 4l-4 4 4 4"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </header>

            {/* The filter — one quiet underlined input (§12.3), cool caret.
                Not inside a <form> (Escape must reach the catalog from here). */}
            <div className="px-8 pb-5">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="filter"
                aria-label="Filter the catalog"
                autoFocus
                className="w-full border-b border-haze/25 bg-transparent pb-1 text-sm font-light tracking-wide text-starlight caret-haze outline-none transition-colors duration-200 ease-soft placeholder:text-haze/35 focus:border-haze/70"
              />
            </div>

            {/* The list — every star alphabetically, its practices nested.
                Every row navigates to its star. Designed rows (PRD 30): a
                faint haze hover wash + comfortable padding (the honest
                hit-area rule — the row, not just the glyphs, is the target;
                the negative x-margin keeps the text on the panel's column),
                star rows visually senior to their practices, and a clear
                nesting rhythm. The app's thin cool scrollbar (`app-scroll`). */}
            <nav
              aria-label="Stars"
              className="app-scroll min-h-0 flex-1 overflow-y-auto px-8 pb-8"
            >
              {entries.length > 0 ? (
                <ul className="flex flex-col gap-3">
                  {entries.map(({ star, practices }) => (
                    <li key={star.id} className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => navigate(star.id)}
                        className={`-mx-3 block w-[calc(100%+1.5rem)] truncate rounded-md px-3 py-2 text-left text-sm font-light tracking-wide ${ACTION_PRIMARY} hover:bg-haze/5`}
                      >
                        {star.name}
                      </button>
                      {practices.length > 0 && (
                        <ul className="ml-1 mt-0.5 flex flex-col border-l border-haze/10 pl-3">
                          {practices.map((practice) => (
                            <li key={practice.id}>
                              <button
                                type="button"
                                onClick={() => navigate(star.id)}
                                className={`-mx-2 block w-[calc(100%+1rem)] truncate rounded-md px-2 py-1.5 text-left text-xs font-light tracking-wide ${ACTION_SECONDARY} hover:bg-haze/5`}
                              >
                                {practice.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs font-light tracking-wide text-haze/40">
                  nothing matches
                </p>
              )}
            </nav>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
