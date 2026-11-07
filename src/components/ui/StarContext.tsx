"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { duration, easing, toSeconds } from "@/design/tokens";
import { minutesToMs, parseSessionMinutes } from "@/settings";
import {
  describeSubtree,
  type MoonId,
  type PlanetId,
  type Star,
  type StarId,
} from "@/universe";

import {
  ACTION_DESTRUCTIVE,
  ACTION_HIT,
  ACTION_HIT_DENSE,
  ACTION_PRIMARY,
  ACTION_SECONDARY,
} from "./action-tiers";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { CreateBodyForm } from "./CreateBodyForm";

interface StarContextProps {
  /**
   * The currently-selected star, or null. Selection is ephemeral UI state owned
   * by `page.tsx` (§12.6). `page.tsx` passes null while a session is running, so
   * the whole context recedes during focus and returns when the session ends.
   */
  readonly selectedStar: Star | null;
  /**
   * Add a practice (planet) to the selected star. `page.tsx` owns the mutation:
   * `addPlanetToUniverse(createPlanet(selectedStarId, …))` via `useUniverse().update`.
   */
  readonly onAddPractice: (name: string, description: string | null) => void;
  /** Clears the selection (Escape while nothing it owns is open). Optional. */
  readonly onDeselect?: () => void;
  /**
   * Open a body's page in the dock (PRD 18) — the star (its id) or one of its
   * practices (a planet id). The hover/focus-revealed "notes" affordance calls
   * this; `page.tsx` owns the dock state (`openPageBodyId`). This is the *only*
   * prop the page feature adds — opening a page is additive, so every existing
   * action (edit/delete/+sub/focus) is unchanged.
   */
  readonly onOpenPage: (bodyId: StarId | PlanetId) => void;
  /**
   * Open a practice's MIND (PRD 34) — the planet mind: a per-practice surface
   * that, only with that practice's consent (default off), reads ONLY that
   * practice's own notes and offers a reflection / conversation / a proposed
   * note change. `page.tsx` owns the open state + the consented read; this is
   * the per-practice "mind" affordance.
   */
  readonly onOpenPlanetMind: (planetId: PlanetId) => void;
  /**
   * Open the STAR's MIND (PRD 36) — the star mind: a per-pursuit surface that,
   * only with that star's consent (default off), reads the star's OWN notes PLUS
   * every practice orbiting it (the subtree, capped) and offers a cross-practice
   * reflection / conversation / a proposed note change that names which note it
   * targets. `page.tsx` owns the open state + the consented read; this is the
   * star-level "mind" affordance (beside the practice-level one on each row).
   */
  readonly onOpenStarMind: (starId: StarId) => void;
  /**
   * Edit the selected star's label — name + description only (PRD 16). `page.tsx`
   * owns the mutation (`editStarDetails`); earned state is structurally unreachable.
   */
  readonly onEditStar: (name: string, description: string | null) => void;
  /**
   * Delete the selected star and its whole subtree (PRD 16) — behind the named
   * cascade confirmation. `page.tsx` owns the mutation (`deleteStar`) and clears
   * the selection afterward (the star no longer exists).
   */
  readonly onDeleteStar: () => void;
  /**
   * The last-used session length, in minutes (PRD 21) — the duration field
   * pre-fills with this (25 on first run). A durable UI preference owned by
   * `page.tsx` (`useSessionDuration`), NOT a property of any body in the tree.
   */
  readonly defaultDurationMinutes: number;
  /**
   * Begins a focus session on the chosen practice, of the length the field
   * currently holds (PRD 21 — `durationMs`). `page.tsx` records the start
   * timestamp (`createSession`), remembers the length as the new last-used, and
   * enters the running state; on completion it commits via
   * `commitCompletedSession` + `useUniverse().update`. An empty/invalid field is
   * a gentle no-op (the click does nothing) — caught here before calling up.
   */
  readonly onBeginFocus: (planetId: PlanetId, durationMs: number) => void;
  /**
   * Adds a sub-practice (a moon) to a specific practice (PRD 12). `page.tsx` owns
   * the mutation: `addMoonToUniverse(createMoon(planetId, …))` via `update`.
   */
  readonly onCreateMoon: (
    planetId: PlanetId,
    name: string,
    description: string | null,
  ) => void;
  /** Edit a practice's label — name + description only (PRD 16). */
  readonly onEditPlanet: (
    planetId: PlanetId,
    name: string,
    description: string | null,
  ) => void;
  /** Delete a practice and its moons (PRD 16), behind the named confirmation. */
  readonly onDeletePlanet: (planetId: PlanetId) => void;
  /** Edit a sub-practice's label — name + description only (PRD 16). */
  readonly onEditMoon: (
    moonId: MoonId,
    name: string,
    description: string | null,
  ) => void;
  /** Delete a sub-practice (PRD 16), behind the confirmation. */
  readonly onDeleteMoon: (moonId: MoonId) => void;
}

/**
 * The one overlay open at a time — a create/edit form or a delete confirmation,
 * for any level (star / practice / sub-practice). A single state gives a single
 * close path (`setOverlay(null)`), guarantees only one scrim is ever up, and
 * (because each scrim covers the panel) means no second overlay can be opened
 * until the first closes — so a pre-filled form always mounts fresh. It also
 * folds the star-level add/edit/delete (formerly three booleans in `AddPractice`)
 * into the same parametrized form/dialog moment as the practice/sub-practice ones.
 */
type Overlay =
  | { readonly kind: "addPractice" }
  | { readonly kind: "editStar" }
  | { readonly kind: "deleteStar" }
  | { readonly kind: "addMoon"; readonly planetId: PlanetId }
  | { readonly kind: "editPlanet"; readonly planetId: PlanetId }
  | { readonly kind: "deletePlanet"; readonly planetId: PlanetId }
  | { readonly kind: "editMoon"; readonly moonId: MoonId }
  | { readonly kind: "deleteMoon"; readonly moonId: MoonId };

// Shared row-action styling — the hover/focus-revealed verbs, on the action
// tiers (PRD 30, `action-tiers.ts`): "notes" (opens the page dock) is the
// row's primary verb and sits first; edit / "+ sub-practice" are utilities;
// delete is quiet-destructive. Moons read one notch smaller to sit beneath
// their practice; the *register* comes from the shared tier either way.
const BODY_ACTION = `text-[10px] font-light uppercase tracking-[0.3em] ${ACTION_HIT_DENSE} ${ACTION_SECONDARY}`;
const BODY_DELETE = `text-[10px] font-light uppercase tracking-[0.3em] ${ACTION_HIT_DENSE} ${ACTION_DESTRUCTIVE}`;
const MOON_ACTION = `text-[9px] font-light uppercase tracking-[0.25em] ${ACTION_HIT_DENSE} ${ACTION_SECONDARY}`;
const MOON_DELETE = `text-[9px] font-light uppercase tracking-[0.25em] ${ACTION_HIT_DENSE} ${ACTION_DESTRUCTIVE}`;
const PAGE_ACTION = `text-[10px] font-light uppercase tracking-[0.3em] ${ACTION_HIT_DENSE} ${ACTION_PRIMARY}`;
// The reserved-space action line (PRD 30): a FIXED-height row that is always
// laid out and only changes opacity on hover/focus — revealing actions can
// never shift or overlap a neighbour, by rule rather than by luck.
const ACTION_ROW_REVEAL =
  "flex h-4 items-center gap-3 opacity-0 transition-opacity duration-200 ease-soft";

/**
 * The selected-star context — one cohesive, anchored panel (the unify polish;
 * formerly the separate `AddPractice` + `FocusLauncher`). With a star selected it
 * presents, top-to-bottom, as a single column:
 *
 *   1. the star **name** + hover/focus-revealed star **edit** / **delete**;
 *   2. a demoted **"begin a focus session"** caption (shown once practices exist);
 *   3. the **practice list** — each practice click-to-focus (a session of the
 *      chosen length targets a *planet*, chosen here in the DOM), with hover/focus
 *      **edit / delete / + sub-practice** and an indented **sub-practice (moon)**
 *      list whose rows carry their own **edit / delete** (PRD 12 / PRD 16);
 *   4. a quiet **"+ add practice"** at the foot.
 *
 * It composes the shared `CreateBodyForm` (pre-filled for edit, §12.5) and the
 * shared `ConfirmDeleteDialog` unchanged; the resting state stays bare names, the
 * manage actions fading in only on hover or keyboard focus (negative space is
 * sacred, §12.3). The panel's text is cool/neutral — the only warm element is the
 * real star glowing on the canvas (warm = earned, §7). It anchors to a fixed
 * lower-center screen zone; the star keeps its canvas position + SelectionRing
 * (no 3D projection, no camera retarget). A DOM overlay over the canvas, never
 * inside it (§12.1); mutation stays in `page.tsx` (§12.2), edit touches name +
 * description only (the honest-universe principle, enforced in the mutators).
 */
export function StarContext({
  selectedStar,
  onAddPractice,
  onDeselect,
  onOpenPage,
  onOpenPlanetMind,
  onOpenStarMind,
  onEditStar,
  onDeleteStar,
  defaultDurationMinutes,
  onBeginFocus,
  onCreateMoon,
  onEditPlanet,
  onDeletePlanet,
  onEditMoon,
  onDeleteMoon,
}: StarContextProps) {
  const practices = selectedStar?.planets ?? [];
  const [overlay, setOverlay] = useState<Overlay | null>(null);

  // The typed session length (PRD 21). A string so the field can hold transient
  // empty/partial input while typing; parsed + clamped only when a session
  // starts. Seeded from the last-used value and re-seeded when that resolves from
  // persistence (or changes after a start) via React's "adjust state during
  // render" pattern — a state-tracked compare (the same idiom PageNotesBody uses
  // to reset on a body switch), NOT a ref read/write in render (react-hooks/refs)
  // and NOT a setState-in-effect (react-hooks/set-state-in-effect). Mid-typing is
  // never clobbered: the default only changes on load or after a start, not while
  // the user edits.
  const [durationText, setDurationText] = useState(() =>
    String(defaultDurationMinutes),
  );
  const [lastDefault, setLastDefault] = useState(defaultDurationMinutes);
  if (defaultDurationMinutes !== lastDefault) {
    setLastDefault(defaultDurationMinutes);
    setDurationText(String(defaultDurationMinutes));
  }

  // Click-to-focus carries the field's chosen length (PRD 21). An empty /
  // non-positive / non-numeric value is a gentle no-op (nothing starts, no
  // scold) — the field is pre-filled valid, so this only happens on a deliberate
  // clear. A valid value is clamped to the sane band before starting; page.tsx
  // remembers it as the new last-used.
  function beginFocus(planetId: PlanetId) {
    const minutes = parseSessionMinutes(durationText);
    if (minutes === null) return;
    onBeginFocus(planetId, minutesToMs(minutes));
  }

  // Escape clears the selection only while the panel is showing and nothing it
  // owns is open. Every form owns Escape via `CreateBodyForm`'s handler and the
  // delete dialog via its panel-scoped `onKeyDown`, so the window listener stands
  // down whenever any overlay is open (no double-fire, no collision, §12.8). The
  // render guards defend the impossible state regardless.
  useEffect(() => {
    if (!selectedStar || overlay !== null || !onDeselect) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDeselect!();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedStar, overlay, onDeselect]);

  // Resolve the open overlay's target from the *freshest* list each render (the
  // resilience pattern, §12.6): a stale/deleted id resolves to null, so an overlay
  // never shows for a body that's gone, and never while the star is deselected.
  const planetOf = (planetId: PlanetId) =>
    practices.find((p) => p.id === planetId) ?? null;
  const moonOf = (moonId: MoonId) =>
    practices.flatMap((p) => p.moons).find((m) => m.id === moonId) ?? null;

  // One parametrized form moment serves every form (add practice / edit pursuit /
  // add sub-practice / edit practice / edit sub-practice) — only one is ever open.
  // `overlay` is a const, so its narrowed type flows into each onSubmit closure.
  const formConfig = (() => {
    if (overlay?.kind === "addPractice") {
      if (!selectedStar) return null;
      return {
        title: "What practice will you add?",
        body: (
          <>
            A practice that orbits{" "}
            <span className="text-haze/90">{selectedStar.name}</span>. It begins
            at the start of its path; tend it, and it will move forward.
          </>
        ),
        initialName: "",
        initialDescription: "",
        submitLabel: "Begin",
        nameHint: "A practice needs a name.",
        onSubmit: (name: string, description: string | null) => {
          onAddPractice(name, description);
          setOverlay(null);
        },
      };
    }
    if (overlay?.kind === "editStar") {
      if (!selectedStar) return null;
      return {
        title: "Edit this pursuit",
        body: (
          <>
            Fix its name or description. Its light is unchanged — a star shines
            only from the work you do.
          </>
        ),
        initialName: selectedStar.name,
        initialDescription: selectedStar.description ?? "",
        submitLabel: "Save",
        nameHint: "A star needs a name.",
        onSubmit: (name: string, description: string | null) => {
          onEditStar(name, description);
          setOverlay(null);
        },
      };
    }
    if (overlay?.kind === "addMoon") {
      const planet = planetOf(overlay.planetId);
      if (!planet) return null;
      return {
        title: "What sub-practice will you add?",
        body: (
          <>
            A finer practice nested beneath{" "}
            <span className="text-haze/90">{planet.name}</span>. It advances as
            you tend that practice above it — sub-skills grow from the work they
            orbit.
          </>
        ),
        initialName: "",
        initialDescription: "",
        submitLabel: "Begin",
        nameHint: "A sub-practice needs a name.",
        onSubmit: (name: string, description: string | null) => {
          onCreateMoon(overlay.planetId, name, description);
          setOverlay(null);
        },
      };
    }
    if (overlay?.kind === "editPlanet") {
      const planet = planetOf(overlay.planetId);
      if (!planet) return null;
      return {
        title: "Edit this practice",
        body: (
          <>
            Fix its name or description. Its orbit is unchanged — a practice moves
            forward only from the work you do.
          </>
        ),
        initialName: planet.name,
        initialDescription: planet.description ?? "",
        submitLabel: "Save",
        nameHint: "A practice needs a name.",
        onSubmit: (name: string, description: string | null) => {
          onEditPlanet(overlay.planetId, name, description);
          setOverlay(null);
        },
      };
    }
    if (overlay?.kind === "editMoon") {
      const moon = moonOf(overlay.moonId);
      if (!moon) return null;
      return {
        title: "Edit this sub-practice",
        body: (
          <>
            Fix its name or description. Its orbit is unchanged — it advances only
            from the practice above it.
          </>
        ),
        initialName: moon.name,
        initialDescription: moon.description ?? "",
        submitLabel: "Save",
        nameHint: "A sub-practice needs a name.",
        onSubmit: (name: string, description: string | null) => {
          onEditMoon(overlay.moonId, name, description);
          setOverlay(null);
        },
      };
    }
    return null;
  })();

  // One parametrized delete confirmation (pursuit / practice / sub-practice).
  const deleteConfig = (() => {
    if (overlay?.kind === "deleteStar") {
      if (!selectedStar) return null;
      return {
        name: selectedStar.name,
        cascade: describeSubtree(selectedStar),
        onConfirm: () => {
          onDeleteStar();
          setOverlay(null);
        },
      };
    }
    if (overlay?.kind === "deletePlanet") {
      const planet = planetOf(overlay.planetId);
      if (!planet) return null;
      return {
        name: planet.name,
        cascade: describeSubtree(planet),
        onConfirm: () => {
          onDeletePlanet(planet.id);
          setOverlay(null);
        },
      };
    }
    if (overlay?.kind === "deleteMoon") {
      const moon = moonOf(overlay.moonId);
      if (!moon) return null;
      return {
        name: moon.name,
        cascade: describeSubtree(moon),
        onConfirm: () => {
          onDeleteMoon(moon.id);
          setOverlay(null);
        },
      };
    }
    return null;
  })();

  return (
    <>
      {/* The unified panel — one anchored, MEASURED column in a fixed
          lower-center zone (PRD 30): star name + manage actions → demoted
          caption → duration → practice list → "+ add practice", on a fixed
          max-width with defined gap steps (no element depends on luck to avoid
          another). Anchored to a screen zone, NOT projected from the star's 3D
          position (the star keeps its canvas SelectionRing); the floating
          text-in-space context is the app's signature — locked kept. */}
      <AnimatePresence>
        {selectedStar && (
          <motion.div
            key="star-context"
            className="pointer-events-none absolute inset-x-0 bottom-28 flex justify-center px-6 text-center"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: toSeconds(duration.slow), ease: easing.cinematic }}
          >
            <div className="flex w-full max-w-[22rem] flex-col items-center gap-6">
              {/* Header — the star name (the panel's title; cool/neutral, never
                  warm) with its hover/focus-revealed verbs in reserved space,
                  then the demoted caption beneath it (only once there's
                  something to begin). */}
              <div className="flex flex-col items-center gap-2">
                <div className="group pointer-events-auto flex flex-col items-center gap-1.5">
                  <p className="max-w-full truncate text-base font-light tracking-wide text-starlight/90">
                    {selectedStar.name}
                  </p>
                  <div
                    className={`${ACTION_ROW_REVEAL} group-hover:opacity-100 group-focus-within:opacity-100`}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenPage(selectedStar.id)}
                      className={PAGE_ACTION}
                    >
                      notes
                    </button>
                    <span aria-hidden className="text-haze/20">
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenStarMind(selectedStar.id)}
                      className={BODY_ACTION}
                    >
                      mind
                    </button>
                    <span aria-hidden className="text-haze/20">
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={() => setOverlay({ kind: "editStar" })}
                      className={BODY_ACTION}
                    >
                      edit
                    </button>
                    <span aria-hidden className="text-haze/20">
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={() => setOverlay({ kind: "deleteStar" })}
                      className={BODY_DELETE}
                    >
                      delete
                    </button>
                  </div>
                </div>
                {practices.length > 0 && (
                  <p className="text-[10px] font-light uppercase tracking-[0.4em] text-haze/40">
                    begin a focus session
                  </p>
                )}
                {/* The session length (PRD 21) — one quiet typed field for the
                    whole panel (the length is one choice for the session you're
                    about to start, not a per-practice property). Cool/neutral: a
                    haze caret, never the create form's warm caret-corona (warm is
                    earned, §7). An empty/invalid value is a gentle no-op on start. */}
                {practices.length > 0 && (
                  <label className="pointer-events-auto flex items-baseline justify-center gap-1.5 text-[10px] font-light lowercase tracking-[0.2em] text-haze/45">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={durationText}
                      onChange={(e) => setDurationText(e.target.value)}
                      aria-label="Session length in minutes"
                      className="w-10 border-b border-haze/25 bg-transparent pb-0.5 text-center text-sm font-light tabular-nums tracking-normal text-starlight caret-haze outline-none transition-colors duration-200 ease-soft focus:border-haze/70"
                    />
                    min
                  </label>
                )}
              </div>

              {/* The practice list — click a name to begin a session; hover/focus
                  reveals each row's reserved-space manage actions and its moon
                  sub-list. */}
              {practices.length > 0 && (
                <ul className="flex flex-col items-center gap-4">
                  {practices.map((planet) => (
                    <li
                      key={planet.id}
                      className="flex flex-col items-center gap-1.5"
                    >
                      <div className="group/planet pointer-events-auto flex flex-col items-center gap-1">
                        <button
                          type="button"
                          onClick={() => beginFocus(planet.id)}
                          className={`max-w-full truncate text-sm font-light tracking-wide ${ACTION_HIT_DENSE} ${ACTION_PRIMARY}`}
                        >
                          {planet.name}
                        </button>
                        <div
                          className={`${ACTION_ROW_REVEAL} group-hover/planet:opacity-100 group-focus-within/planet:opacity-100`}
                        >
                          <button
                            type="button"
                            onClick={() => onOpenPage(planet.id)}
                            className={PAGE_ACTION}
                          >
                            notes
                          </button>
                          <span aria-hidden className="text-haze/20">
                            ·
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpenPlanetMind(planet.id)}
                            className={BODY_ACTION}
                          >
                            mind
                          </button>
                          <span aria-hidden className="text-haze/20">
                            ·
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setOverlay({ kind: "editPlanet", planetId: planet.id })
                            }
                            className={BODY_ACTION}
                          >
                            edit
                          </button>
                          <span aria-hidden className="text-haze/20">
                            ·
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setOverlay({
                                kind: "deletePlanet",
                                planetId: planet.id,
                              })
                            }
                            className={BODY_DELETE}
                          >
                            delete
                          </button>
                          <span aria-hidden className="text-haze/20">
                            ·
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setOverlay({ kind: "addMoon", planetId: planet.id })
                            }
                            className={BODY_ACTION}
                          >
                            + sub-practice
                          </button>
                        </div>
                      </div>

                      {/* The sub-practices (moons) — a quiet sub-list. Not focusable
                          (V1); each row reveals its own edit/delete on hover/focus
                          (inline-right — laid out always, opacity-revealed). */}
                      {planet.moons.length > 0 && (
                        <ul className="flex flex-col items-center gap-2">
                          {planet.moons.map((moon) => (
                            <li
                              key={moon.id}
                              className="group/moon pointer-events-auto flex items-center gap-2"
                            >
                              <span className="max-w-[14rem] truncate text-[11px] font-light tracking-wide text-haze/45">
                                {moon.name}
                              </span>
                              <span className="flex items-center gap-2 opacity-0 transition-opacity duration-200 ease-soft group-hover/moon:opacity-100 group-focus-within/moon:opacity-100">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOverlay({ kind: "editMoon", moonId: moon.id })
                                  }
                                  className={MOON_ACTION}
                                >
                                  edit
                                </button>
                                <span aria-hidden className="text-haze/15">
                                  ·
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOverlay({
                                      kind: "deleteMoon",
                                      moonId: moon.id,
                                    })
                                  }
                                  className={MOON_DELETE}
                                >
                                  delete
                                </button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* "+ add practice" — the primary action at the foot of the panel. */}
              <button
                type="button"
                onClick={() => setOverlay({ kind: "addPractice" })}
                className={`pointer-events-auto text-[11px] font-light uppercase tracking-[0.4em] ${ACTION_HIT} ${ACTION_PRIMARY}`}
              >
                + add practice
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The form moment — add practice / edit pursuit / add sub-practice / edit
          practice / edit sub-practice, the same shared `CreateBodyForm`
          (pre-filled for edit) over a faint scrim. */}
      <AnimatePresence>
        {formConfig && (
          <motion.div
            key="body-form"
            className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-void/60 px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: toSeconds(duration.base), ease: easing.soft }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setOverlay(null);
            }}
          >
            <motion.div
              className="flex max-w-md flex-col items-center gap-12 text-center"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{
                duration: toSeconds(duration.slow),
                ease: easing.cinematic,
              }}
            >
              <div className="flex flex-col gap-4">
                <h2 className="text-sm font-light uppercase tracking-[0.4em] text-starlight/90">
                  {formConfig.title}
                </h2>
                <p className="max-w-sm text-xs font-light leading-relaxed tracking-wide text-haze">
                  {formConfig.body}
                </p>
              </div>
              <CreateBodyForm
                onCreate={formConfig.onSubmit}
                onCancel={() => setOverlay(null)}
                submitLabel={formConfig.submitLabel}
                nameHint={formConfig.nameHint}
                initialName={formConfig.initialName}
                initialDescription={formConfig.initialDescription}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The delete confirmation — pursuit / practice / sub-practice; names the
          cascade. Shared `ConfirmDeleteDialog` (scrim + panel-scoped Escape). */}
      <AnimatePresence>
        {deleteConfig && (
          <ConfirmDeleteDialog
            key="confirm-delete"
            name={deleteConfig.name}
            cascade={deleteConfig.cascade}
            onConfirm={deleteConfig.onConfirm}
            onCancel={() => setOverlay(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
