"use client";

import { motion } from "motion/react";

import { duration, easing, toSeconds } from "@/design/tokens";
import { usePage } from "@/persistence";
import type { PlanetId, StarId } from "@/universe";

import { ACTION_HIT_DENSE, ACTION_SECONDARY, STATUS_CUE } from "./action-tiers";
import { PageNotesBody, statusLabel } from "./PageNotesBody";

interface PageDockProps {
  /**
   * The body whose page is open — a star or a planet (moons have no page
   * affordance in V1). Non-null: `page.tsx` only mounts the dock once a body is
   * resolved. Drives `usePage(bodyId)` for load + debounced autosave (PRD 17).
   */
  readonly bodyId: StarId | PlanetId;
  /** The body's name — the dock header's title. Resolved by `page.tsx`. */
  readonly bodyName: string;
  /** Which kind of body — selects the header kicker ("Pursuit" / "Practice"). */
  readonly kind: "star" | "planet";
  /** Close the dock (the chevron control). `page.tsx` clears `openPageBodyId`. */
  readonly onClose: () => void;
  /**
   * An approved planet-mind proposal's new note text (PRD 35), or undefined.
   * When present the editor opens prefilled with it and in edit mode, and it
   * persists through `usePage`'s normal save path (the human-confirmed save) —
   * the mind writes nothing; the editor (a human surface) does. `page.tsx`
   * remounts the dock when a fresh draft arrives, so this applies once.
   */
  readonly draft?: string;
}

/** The header kicker — a star is a pursuit, a planet a practice (the app's language). */
const KICKER: Record<PageDockProps["kind"], string> = {
  star: "Pursuit",
  planet: "Practice",
};

/**
 * The page dock (PRD 18) — the right-hand pane of the split layout. The universe
 * stays live on the left (`page.tsx` puts the canvas + every overlay in a flex
 * canvas region); this is its sibling, so the universe genuinely narrows beside
 * it — a true split, not a panel covering the sky.
 *
 * It reads and edits the body's page (autosaved through PRD 17's `usePage`) via
 * the shared `PageNotesBody` — the same read/edit toggle + markdown rendering
 * (PRD 19) the in-session notes panel (PRD 20) also uses, so there is **one note,
 * one save path**, reached through two doors. `usePage` lives *here* (not in the
 * body) so the header can show its save cue, and so closing/switching flushes the
 * pending autosave (the hook flushes on id-change/unmount). The stored value is
 * **plain markdown** (PRD 17); rendering is a pure display transform.
 *
 * **Warm = earned (§7):** the dock — chrome *and* body — is entirely cool/neutral;
 * rendered links are a cool amethyst accent, never gold. The only warm element in
 * the app remains the real star on the canvas.
 *
 * The open/close transition is **instant split + content fade** (§12.11).
 *
 * Not a modal: a complementary region (`<aside>`, no `role="dialog"`), so the
 * page-level Escape hierarchy can peel it (editing → read → close → deselect; the
 * body's textarea carries `data-page-editor` so the `page.tsx` listener exits edit
 * mode before closing, §12.11). A DOM overlay beside the canvas (§12.1).
 */
export function PageDock({ bodyId, bodyName, kind, onClose, draft }: PageDockProps) {
  const { content, save, status } = usePage(bodyId, draft);
  const cue = statusLabel(status);

  return (
    <motion.aside
      className="relative flex h-full w-[44%] shrink-0 flex-col border-l border-haze/10 bg-abyss"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: toSeconds(duration.base), ease: easing.cinematic }}
    >
      {/* Header — kicker + name on the left; the quiet save cue + close chevron
          on the right. Cool/neutral, never warm. */}
      <header className="flex items-start justify-between gap-4 px-8 pb-5 pt-8">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-[10px] font-light uppercase tracking-[0.4em] text-haze/50">
            {KICKER[kind]}
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
            onClick={onClose}
            aria-label="Close page"
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

      {/* Body — the shared read/edit toggle (PRD 19), bound to this dock's
          `usePage` (unchanged save path). Read: rendered markdown, click/Enter to
          edit. Edit: the raw textarea (`data-page-editor` is the Escape hook). An
          approved proposal's draft (PRD 35) opens straight in edit mode so the
          prefilled new note is immediately editable. */}
      <PageNotesBody
        bodyId={bodyId}
        content={content}
        save={save}
        startInEdit={draft !== undefined}
      />
    </motion.aside>
  );
}
