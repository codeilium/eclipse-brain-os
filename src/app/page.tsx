"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig } from "motion/react";

import {
  galaxyFocusedMinutes,
  Observatory,
  starPositionFromId,
  type CameraFlyTo,
} from "@/components/observatory";
import {
  CenterPanel,
  FocusSession,
  GalaxySwitcher,
  InSessionNotes,
  NewPursuitButton,
  Onboarding,
  PageDock,
  PlanetMindPanel,
  ResetViewButton,
  SettingsButton,
  StarCatalog,
  StarContext,
  StarMindPanel,
  Wordmark,
} from "@/components/ui";
import {
  isSessionComplete,
  sessionRemainingMs,
} from "@/components/ui/focus-timer";
import {
  readConsentedPlanetNotes,
  readConsentedStarNotes,
  type StarSubtreeBody,
} from "@/mind-bridge";
import { deletePages, subtreeIds, useUniverse } from "@/persistence";
import {
  msToMinutes,
  resolveStoredGalaxyId,
  useAnthropicKey,
  useCurrentGalaxy,
  useMotionPreference,
  usePlanetMindConsent,
  useSessionDuration,
  useStarMindConsent,
} from "@/settings";
import {
  addGalaxyToUniverse,
  addMoonToUniverse,
  addPlanetToUniverse,
  addStarToUniverse,
  commitCompletedSession,
  createGalaxy,
  createMoon,
  createPlanet,
  createSession,
  createStar,
  deleteMoon,
  deletePlanet,
  deleteStar,
  editGalaxyDetails,
  editMoonDetails,
  editPlanetDetails,
  editStarDetails,
  findMoonById,
  findPlanetById,
  findStarById,
  type GalaxyId,
  type ISODateString,
  type MoonId,
  type PlanetId,
  type Session,
  type StarId,
} from "@/universe";

export default function Home() {
  const { state, update } = useUniverse();

  // Reduced-motion preference (PRD 15): OS `prefers-reduced-motion` combined with
  // the user's persisted override → a single resolved `reduced` boolean. Threaded
  // *down* into the canvas (one prop) so the ambient loops quiet without per-frame
  // querying; `preference`/`setPreference` drive the settings toggle. `loaded`
  // gates the canvas so a force-reduce user never sees a frame of motion before
  // the override resolves.
  const { reduced, preference, setPreference, loaded } = useMotionPreference();

  // Last-used focus-session length (PRD 21) — the launcher's duration field
  // pre-fills with `lastUsedMs` (25 min on first run, via useSessionDuration's
  // default/fallback); starting a session remembers the chosen length here. A
  // durable UI *preference* (the settings store), never a property of any body.
  const { lastUsedMs, setLastUsedMs } = useSessionDuration();

  // The current galaxy (PRD 27) — which sky is on screen. The id is ephemeral
  // view state (the `selectedStarId` sibling); `null` means "no explicit switch
  // this session" and defers to the persisted last-viewed id (the hook below),
  // which falls back to the first galaxy via the pure `resolveStoredGalaxyId`.
  // The galaxy itself is resolved fresh from the universe each render (§12.6 —
  // a stale id can never strand the app).
  const [currentGalaxyId, setCurrentGalaxyId] = useState<GalaxyId | null>(null);
  const { storedGalaxyId, galaxyLoaded, rememberGalaxy } = useCurrentGalaxy();

  // Selection is ephemeral UI state — it lives here in React state, NEVER in the
  // universe model and NEVER persisted. The canvas receives it *down* as a prop
  // and reports clicks *up* via setSelectedStarId (the canvas→DOM event channel,
  // r3f-conventions §12.6); the canvas itself owns no selection state.
  const [selectedStarId, setSelectedStarId] = useState<StarId | null>(null);

  // Whether the center panel — the galaxy's mind (PRD 28) — is open. ALSO
  // ephemeral UI state (the selection's sibling): an open panel is not a fact
  // about the universe, and the fog/signal inside it are ephemeral by design
  // (component state, stored nowhere — closing unmounts and forgets them).
  const [centerOpen, setCenterOpen] = useState(false);

  // Which practice's MIND is open (PRD 34 — the planet mind), or null. ALSO
  // ephemeral UI state (the centerOpen sibling): the reflection/conversation
  // inside it are ephemeral; only the per-planet consent flag persists.
  const [planetMindTargetId, setPlanetMindTargetId] = useState<PlanetId | null>(
    null,
  );

  // Which pursuit's MIND is open (PRD 36 — the star mind), or null. ALSO
  // ephemeral UI state (the planetMindTargetId sibling): the reflection/
  // conversation inside it are ephemeral; only the per-star consent flag
  // persists. One mind surface at a time — the star mind, the planet mind, and
  // the galaxy's center panel never coexist.
  const [starMindTargetId, setStarMindTargetId] = useState<StarId | null>(null);

  // Per-planet "its mind may read its notes" consent (PRD 34) — lifted ONCE
  // here (the useAnthropicKey pattern) so the planet-mind panel reads one source
  // of truth. Additive settings, default off, revocable — NOT in the universe's
  // earned record.
  const { isConsented, setConsent } = usePlanetMindConsent();

  // Per-star "its mind may read its subtree" consent (PRD 36) — lifted ONCE here
  // (the usePlanetMindConsent sibling), its own gate, default off, revocable.
  // Consenting to a whole subtree is a larger act than consenting to one
  // practice, so it is a separate decision from the per-planet flag.
  const { isConsented: isStarConsented, setConsent: setStarConsent } =
    useStarMindConsent();

  // The person's own Anthropic API key (PRD 28) — lifted ONCE here (the
  // useMotionPreference pattern) so the settings fieldset (save/clear) and the
  // center panel (the call credential) share a single source of truth. The
  // value is only ever passed as a prop/credential — never rendered, never
  // logged.
  const { apiKey, saveKey, clearKey } = useAnthropicKey();

  // Which body's page the dock shows (PRD 18) — a star or a practice id, or null
  // when the dock is closed. ALSO ephemeral UI state (like selection + the
  // running session), NEVER persisted: an open notebook is not a fact about the
  // universe. The page CONTENT persists (via usePage → the pages store, PRD 17);
  // *which* page is open does not.
  const [openPageBodyId, setOpenPageBodyId] = useState<StarId | PlanetId | null>(
    null,
  );

  // An approved mind proposal's new note text (PRD 35; PRD 36), carrying the
  // BODY it belongs to. When the human approves a proposed note change, the page
  // editor opens for that body PREFILLED with this text (editable), and the human
  // commits it through the existing human-confirmed page-save. The planet mind
  // (PRD 35) always names a planet; the star mind (PRD 36) names which note — the
  // star's OWN page or one of its planets — so `bodyId` is a `StarId | PlanetId`.
  // ALSO ephemeral UI state — the mind writes nothing; the editor (a human
  // surface) does. Auto-cleared (the guard below) whenever the open page diverges
  // from the draft's body, so a stale draft never lands in the wrong note.
  const [pageDraft, setPageDraft] = useState<{
    bodyId: StarId | PlanetId;
    text: string;
  } | null>(null);

  // Retire a stale proposal draft (PRD 35) by ADJUSTING STATE DURING RENDER (the
  // §12.6 pattern, like `PageNotesBody`'s body-switch reset — not an effect): the
  // moment the open page diverges from the draft's body (the dock closed, a
  // different body opened, a session started, a switch/deselect, a delete), the
  // draft no longer applies. One guard covers every closer without touching their
  // call sites, so an approved draft can never land in the wrong note or
  // re-prefill a later reopen. Converges in one extra render (then the guard is
  // false).
  if (pageDraft && pageDraft.bodyId !== openPageBodyId) {
    setPageDraft(null);
  }

  // Camera reset nonce — ephemeral view state, like selection (PRD 13). Each
  // increment (from the "reset view" affordance) glides the camera back to the
  // default framing. The camera position itself lives in the canvas
  // (`Camera.tsx`) and is NEVER persisted; this is only the trigger.
  const [resetSignal, setResetSignal] = useState(0);

  // Camera fly-to (PRD 24) — ALSO ephemeral view state, like resetSignal. On star creation,
  // page.tsx resolves the new star's world position (starPositionFromId) and bumps `signal` with
  // it; the camera then glides to center the new star (the reset glide, aimed at the star instead
  // of the origin), so you never have to pan around to find what you just made. The camera
  // position itself lives in the canvas (Camera.tsx) and is NEVER persisted — this is only the
  // trigger + target. `signal: 0` is the initial mount (no glide).
  const [flyTo, setFlyTo] = useState<CameraFlyTo>({ signal: 0, x: 0, y: 0 });

  // The running focus session — ALSO ephemeral UI state (like selection), not
  // universe data: a half-finished timer isn't a fact about the universe, only a
  // *completed* session is. It holds an in-progress `Session` (from the locked
  // `createSession`) whose `startedAt` is the wall-clock source of truth. Held in
  // memory only: a hard reload mid-session abandons it (the accepted V1
  // simplification, r3f-conventions §12.7); backgrounding the tab still completes
  // correctly because elapsed is computed from the timestamp, not a counter.
  const [runningSession, setRunningSession] = useState<Session | null>(null);

  // `now` drives the visible countdown. The timestamp is the source of truth;
  // this 1s tick only re-renders the derived display (and re-checks completion).
  const [now, setNow] = useState<number>(() => Date.now());

  // Guards the completion commit so it fires EXACTLY once per session, even if a
  // tick (or a resume recompute) re-evaluates completion before the running
  // state clears. Stores the id of the session already committed.
  const committedSessionIdRef = useRef<string | null>(null);

  // Read down, mutate up, canvas reacts (r3f-conventions §12): the overlay calls
  // the locked @/universe mutators to derive a new universe and persists via
  // useUniverse().update; the canvas re-renders from its `universe` prop. The
  // mutator (`addStarToUniverse`) runs against the freshest universe inside `update`.
  async function handleCreateStar(name: string, description: string | null) {
    // Create the star up front so we have its id to glide the camera to it after the write — a
    // new star is seeded somewhere in the disk, so without the glide you'd have to pan around to
    // find what you just made (PRD 24). The galaxy id is read from the CURRENT-galaxy resolution
    // at creation time (PRD 27 — a star is born into the sky you're looking at); galaxies are
    // never deleted in V1, so it stays valid inside the updater — `addStarToUniverse` still runs
    // against the freshest `u`. (The create entry points only render when a galaxy is resolved,
    // so the guard is type-narrowing, not a reachable no-op.)
    if (!currentGalaxy) return;
    const star = createStar(currentGalaxy.id, name, description);
    await update((u) => addStarToUniverse(u, star));
    // Glide to center the new star at the default overview zoom (the reset-view glide, aimed at
    // the star). Its world position is a render-layer function of its id (starPositionFromId — no
    // model change, no reseed); reduced motion snaps the glide in the camera.
    const [x, y] = starPositionFromId(star.id);
    setFlyTo((f) => ({ signal: f.signal + 1, x, y }));
  }

  // Add a planet (practice) to the selected star. selectedStarId is ephemeral UI
  // state (not derivable from `u`), so it is read from the closure — fresh per
  // render, and selection can't change while the form is open. The new planet
  // rests at orbit 0 (createPlanet starts it there); it doesn't advance until a
  // focus session completes (below). Same read-down/mutate-up path as add-star.
  async function handleCreatePlanet(name: string, description: string | null) {
    if (!selectedStarId) return;
    await update((u) =>
      addPlanetToUniverse(u, createPlanet(selectedStarId, name, description)),
    );
  }

  // Add a sub-practice (a moon) to a specific practice. The planet id is passed
  // in from the per-planet "+ add sub-practice" affordance (unambiguous — the
  // practice whose affordance was used), not read from selection. Same
  // read-down/mutate-up path as add-planet. The new moon rests at orbit 0 and
  // advances only via its parent planet's cascade — it is NOT directly focusable
  // (V1), so there is no moon-focus handler, by design (PRD §3/§8).
  async function handleCreateMoon(
    planetId: PlanetId,
    name: string,
    description: string | null,
  ) {
    await update((u) =>
      addMoonToUniverse(u, createMoon(planetId, name, description)),
    );
  }

  // Edit & delete (PRD 16) — fix mistakes. Same read-down/mutate-up path as every
  // create: derive a new universe via the locked @/universe mutator, persist via
  // `update`. Edit touches name + description ONLY — the `editXDetails` mutators
  // accept only `{ name, description }`, so there is no path (and no UI) to hand-edit
  // earned state (sessions/orbits/brightness/growth). The honest-universe principle,
  // enforced structurally: fix a label, never fake a universe.

  // Edit the selected star's label. The target is the selection (the star whose
  // context affordance is showing) — read from the closure, fresh per render.
  async function handleEditStar(name: string, description: string | null) {
    if (!selectedStarId) return;
    await update((u) => editStarDetails(u, selectedStarId, { name, description }));
  }

  // Delete the selected star and its whole subtree, then clear the selection: the
  // star no longer exists, so a dangling `selectedStarId` would reference a gone
  // body (and the selected-context affordances would have nothing to render).
  async function handleDeleteStar() {
    if (!selectedStarId) return;
    // Page cleanup (PRD 17): capture the subtree's page ids BEFORE the delete
    // (the body is gone after), then remove their page records once the delete
    // succeeds — best-effort (orphaned page records are harmless, never read).
    const star =
      state.status === "ready"
        ? findStarById(state.universe, selectedStarId)
        : null;
    await update((u) => deleteStar(u, selectedStarId));
    setSelectedStarId(null);
    if (star) {
      const ids = subtreeIds(star);
      // Close the dock if its open body (or an ancestor) is in the deleted
      // subtree (PRD 18) — the same way the selection is cleared above.
      if (openPageBodyId && ids.includes(openPageBodyId)) setOpenPageBodyId(null);
      void deletePages(ids);
    }
  }

  // Edit / delete a practice (planet). The planet id comes from its StarContext
  // list row (unambiguous), not from selection; the parent star stays selected so
  // the user can keep tidying. Deleting a planet cascades its moons (the mutator).
  async function handleEditPlanet(
    planetId: PlanetId,
    name: string,
    description: string | null,
  ) {
    await update((u) => editPlanetDetails(u, planetId, { name, description }));
  }

  async function handleDeletePlanet(planetId: PlanetId) {
    // Page cleanup (PRD 17): the planet + its moons (see handleDeleteStar).
    const found =
      state.status === "ready" ? findPlanetById(state.universe, planetId) : null;
    await update((u) => deletePlanet(u, planetId));
    if (found) {
      const ids = subtreeIds(found.planet);
      // Close the dock if the open page is this planet or one of its moons (PRD 18).
      if (openPageBodyId && ids.includes(openPageBodyId)) setOpenPageBodyId(null);
      void deletePages(ids);
    }
  }

  // Edit / delete a sub-practice (moon). The moon id comes from its row under its
  // practice in StarContext.
  async function handleEditMoon(
    moonId: MoonId,
    name: string,
    description: string | null,
  ) {
    await update((u) => editMoonDetails(u, moonId, { name, description }));
  }

  async function handleDeleteMoon(moonId: MoonId) {
    // Page cleanup (PRD 17): a moon is a leaf — just its own page (see above).
    const found =
      state.status === "ready" ? findMoonById(state.universe, moonId) : null;
    await update((u) => deleteMoon(u, moonId));
    if (found) void deletePages(subtreeIds(found.moon));
  }

  // Begin a focus session on the chosen practice, of the length the launcher's
  // duration field carries (PRD 21 — `durationMs`). Remembers it as the new
  // last-used (settings), records a wall-clock start timestamp (inside
  // `createSession`, which already carries `durationMs`), and enters the running
  // state. No universe write happens here — only a *completed* session is
  // universe data; the orbit math is unchanged this PRD (PRD 22 makes orbit
  // progress time-proportional). A 100-min session still advances 0.25 for now.
  function handleBeginFocus(planetId: PlanetId, durationMs: number) {
    setLastUsedMs(durationMs);
    // The focus session is the one true mode (§12.7) — the dock closes on start;
    // in-session page access is the in-session notes tab (PRD 20). (The dock is
    // also gated on !runningSession, so it can't render mid-session regardless.)
    setOpenPageBodyId(null);
    // A session is a hard context reset (PRD 34/36) — retire any open mind (the
    // panels are gated on !runningSession too, but clear the targets so they
    // don't reappear when the session ends).
    setPlanetMindTargetId(null);
    setStarMindTargetId(null);
    setNow(Date.now());
    setRunningSession(createSession("planet", planetId, durationMs));
  }

  // Abandon — end the session immediately with NO orbit progress and no recorded
  // completion (completion is the unit; a partial session earns nothing). No
  // `update` call → the universe is unchanged; the overlay closes and the sky
  // un-quiets. No pause: a commitment isn't pausable (PRD §3).
  function handleAbandon() {
    setRunningSession(null);
  }

  // Selection from the canvas (§12.6), wrapped so an empty-canvas click also
  // closes the dock (PRD 18). The canvas reports null ONLY from an empty-space
  // click (a star click reports its id), so null = a decisive "back to the bare
  // universe" → deselect AND close the dock. Selecting a star (non-null) leaves
  // the dock as it is: the dock is additive, not selection-bound.
  function handleSelectStar(id: StarId | null) {
    setSelectedStarId(id);
    if (id === null) setOpenPageBodyId(null);
    // One context at a time (PRD 28): selecting a star OR clicking back to the
    // bare universe both retire the center panel — the mind's surface and a
    // star's context never compete. (Closing unmounts it, which also aborts
    // any in-flight distill call.)
    setCenterOpen(false);
    // A planet/star mind belongs to the star context that was open (PRD 34/36);
    // any selection change retires it (its body's context is gone).
    setPlanetMindTargetId(null);
    setStarMindTargetId(null);
  }

  // The mind's door (PRD 28): the canvas reports a click on the galaxy's
  // center (the black hole's generous hit disc — its own channel, never an
  // empty-space miss). Session-gated like the catalog and the switcher (focus
  // is the one true mode); opening clears any star selection — the center's
  // panel and a star's context are one-at-a-time, both directions.
  function handleSelectCenter() {
    if (runningSession) return;
    setSelectedStarId(null);
    setCenterOpen(true);
    // One context at a time (PRD 34/36): the galaxy's mind and a practice's/
    // pursuit's mind never compete — opening the center retires any open mind.
    setPlanetMindTargetId(null);
    setStarMindTargetId(null);
  }

  // Open a practice's mind (PRD 34) — the planet mind. Session-gated like the
  // center/catalog (focus is the one true mode). The parent star stays selected
  // (the practice lives inside its star context); the galaxy's center panel and
  // the star mind are retired (one mind surface at a time). Opening reads NOTHING
  // by itself — the panel reads this practice's own notes only if its consent is
  // on (default off), through `readConsentedPlanetNotes`.
  function handleOpenPlanetMind(planetId: PlanetId) {
    if (runningSession) return;
    setCenterOpen(false);
    setStarMindTargetId(null);
    setPlanetMindTargetId(planetId);
  }

  // Open a pursuit's mind (PRD 36) — the star mind. Session-gated like the
  // planet mind. The star stays selected (its mind lives inside its star
  // context); the galaxy's center panel and any open planet mind are retired
  // (one mind surface at a time). Opening reads NOTHING by itself — the panel
  // reads this star's subtree only if its consent is on (default off), through
  // `readConsentedStarNotes` with the subtree resolved here in page.tsx.
  function handleOpenStarMind(starId: StarId) {
    if (runningSession) return;
    setCenterOpen(false);
    setPlanetMindTargetId(null);
    setStarMindTargetId(starId);
  }

  // The HUMAN approved a proposed note change (PRD 35) — the planet mind handed
  // back the FULL new note text (the proposal applied to the note by the pure
  // `applyProposal`). Close the mind first (the ephemeral conversation is done,
  // mirroring the old offer-then-create "close first"), then open the EXISTING
  // page editor for this planet PREFILLED with the new text. The human edits/
  // saves it through the existing human-confirmed page-save (`usePage` →
  // `savePage`); the mind writes NOTHING — a proposal is only ever text routed
  // into a human surface.
  function handleApproveProposal(planetId: PlanetId, newNoteText: string) {
    setPlanetMindTargetId(null);
    setPageDraft({ bodyId: planetId, text: newNoteText });
    setOpenPageBodyId(planetId);
  }

  // The HUMAN approved a proposed note change from the STAR mind (PRD 36) — the
  // proposal NAMED its target body (the star's own page or one of its planets'),
  // and the panel handed back that body's id + the FULL new note text (the
  // proposal applied by the pure `applyProposal`). Close the star mind first,
  // then open the EXISTING page editor for the NAMED body PREFILLED + editable;
  // the human commits it through the existing human-confirmed page-save. The mind
  // writes NOTHING; a proposal is only ever text (now naming its note) routed
  // into a human surface. The `openBody` resolution already supports a star id
  // (→ kind "star") as well as a planet id.
  function handleApproveStarProposal(targetBodyId: string, newNoteText: string) {
    setStarMindTargetId(null);
    setPageDraft({ bodyId: targetBodyId as StarId | PlanetId, text: newNoteText });
    setOpenPageBodyId(targetBodyId as StarId | PlanetId);
  }

  // Resolve a star's OWN subtree for the star mind (PRD 36) — the star itself +
  // each planet orbiting it (NEVER a sibling star, the galaxy, or a moon). This
  // is the injected `resolveSubtree` the bridge needs but cannot do itself (the
  // bridge imports nothing from `@/universe`); page.tsx legitimately has the
  // universe, so the structure resolution happens HERE with the real read
  // accessor (`findStarById`) and the bridge only does the consent-gated, capped
  // page reads. Returns an empty subtree for a missing star (the read then yields
  // nothing) — never throws.
  function starSubtreeForMind(starId: string): StarSubtreeBody[] {
    if (state.status !== "ready") return [];
    const star = findStarById(state.universe, starId as StarId);
    if (!star) return [];
    return [
      { bodyId: star.id, bodyName: star.name, kind: "star" },
      ...star.planets.map((p) => ({
        bodyId: p.id,
        bodyName: p.name,
        kind: "planet" as const,
      })),
    ];
  }

  // Navigate from the catalog (PRD 25): select the star AND glide the camera
  // to it — the same fly-to the creation moment fires (PRD 24), aimed at a
  // star you already own. The position is READ from the id (starPositionFromId,
  // render-layer); selecting leaves the dock as it is, exactly like a canvas
  // star click (the dock is additive, not selection-bound). The catalog is
  // gated off while a session runs, so this can't fire against the locked
  // camera. Zero camera code — the glide is PRD 24's, consumed.
  function handleNavigateToStar(starId: StarId) {
    setSelectedStarId(starId);
    const [x, y] = starPositionFromId(starId);
    setFlyTo((f) => ({ signal: f.signal + 1, x, y }));
  }

  // Switch the sky (PRD 27) — a CONTEXT change, never a camera move: the new id
  // re-keys the <Scene> subtree (the camera mounts at the default framing inside
  // the surviving WebGL context; no glide — spatial continuity between galaxies
  // doesn't exist). The old sky's context is cleared EXPLICITLY — selection and
  // the dock belong to the galaxy that was on screen (the catalog clears via its
  // key remount below). The choice is remembered as the last-viewed galaxy
  // (settings, best-effort). The switcher is gated off while a session runs, so
  // this can never fire mid-session.
  function handleSwitchGalaxy(galaxyId: GalaxyId) {
    setCurrentGalaxyId(galaxyId);
    rememberGalaxy(galaxyId);
    setSelectedStarId(null);
    setOpenPageBodyId(null);
    // A different sky is a different mind (PRD 28) — the center panel belongs
    // to the galaxy that was on screen, so a switch retires it like the
    // selection and the dock above.
    setCenterOpen(false);
    // The planet/star mind belongs to a body in the old sky too (PRD 34/36).
    setPlanetMindTargetId(null);
    setStarMindTargetId(null);
  }

  // Create a galaxy and arrive on it (PRD 27): the universe gains a sky (the
  // same read-down/mutate-up path as every create — the locked mutator runs
  // against the freshest `u`), then the view switches to it — an empty sky:
  // the onboarding invitation with the faint heart already waiting (PRD 26's
  // center precedes the stars). The universe id is immutable, so reading it
  // from current state is safe.
  async function handleCreateGalaxy(name: string) {
    if (state.status !== "ready") return;
    const galaxy = createGalaxy(state.universe.id, name);
    await update((u) => addGalaxyToUniverse(u, galaxy));
    handleSwitchGalaxy(galaxy.id);
  }

  // Rename a galaxy — label-only by construction (PRD 16's invariant extended:
  // `editGalaxyDetails` takes only a name; a galaxy stores no description, and
  // its stars and everything they earned are untouchable through it).
  async function handleRenameGalaxy(galaxyId: GalaxyId, name: string) {
    await update((u) => editGalaxyDetails(u, galaxyId, { name }));
  }

  // The tick: while a session runs, refresh `now` once per second. A `visibility`
  // /`focus` recompute makes completion fire the instant the user returns to a
  // backgrounded tab (browsers throttle setInterval in hidden tabs — the
  // timestamp-backing is what keeps that correct). Torn down when idle.
  useEffect(() => {
    if (!runningSession) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    const recompute = () => setNow(Date.now());
    document.addEventListener("visibilitychange", recompute);
    window.addEventListener("focus", recompute);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", recompute);
      window.removeEventListener("focus", recompute);
    };
  }, [runningSession]);

  // Completion (the payoff). Detected on every tick AND on mount/resume (this
  // runs whenever `runningSession` or `now` changes). When the full duration has
  // elapsed, build the completed session and call the locked
  // `commitCompletedSession` via `update` — which advances the planet +0.25 along
  // its orbit (the PRD 8 glide fires), cascades to its moons, and brightens the
  // star (the PRD 6 path fires) — then clear the running state. The single-fire
  // ref guards against a double-commit.
  useEffect(() => {
    if (!runningSession) return;
    const startMs = Date.parse(runningSession.startedAt);
    if (!isSessionComplete(startMs, now, runningSession.durationMs)) return;
    if (committedSessionIdRef.current === runningSession.id) return;
    committedSessionIdRef.current = runningSession.id;

    // The honest completion moment is start + duration — not `now`, which may be
    // later if we returned to an already-finished session.
    const completedAt = new Date(
      startMs + runningSession.durationMs,
    ).toISOString() as ISODateString;
    const completed: Session = {
      ...runningSession,
      status: "completed",
      completedAt,
    };
    void update((u) => commitCompletedSession(u, completed));
    setRunningSession(null);
  }, [runningSession, now, update]);

  // Escape hierarchy (PRD 18, extended PRD 19). While the dock is open this
  // capture-phase listener peels exactly one layer per press — editing → read
  // mode → close dock → deselect — running before StarContext's (bubble-phase)
  // deselect listener, with stopImmediatePropagation preventing the deselect.
  // Layers, innermost first:
  //  1. Editing (the dock's textarea focused, tagged `data-page-editor`): blur it
  //     — its onBlur re-renders the read view — and stop. The dock stays open
  //     (PRD 19's edit → read layer).
  //  2. A focused modal owns Escape: if the active element sits inside a form or
  //     dialog (a CreateBodyForm <form> or the ConfirmDeleteDialog
  //     [role=alertdialog], both of which focus themselves on open), stand down
  //     so the modal's own handler closes it first.
  //  3. Otherwise (read mode): close the dock.
  // A second press then deselects (StarContext). Registered only while the dock
  // is open. (§12.11)
  useEffect(() => {
    if (openPageBodyId === null) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        active.matches("textarea[data-page-editor]")
      ) {
        active.blur();
        e.stopImmediatePropagation();
        return;
      }
      if (active?.closest("form, [role='alertdialog'], [role='dialog']")) return;
      setOpenPageBodyId(null);
      e.stopImmediatePropagation();
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [openPageBodyId]);

  // The current galaxy, resolved fresh each render (PRD 27, the §12.6
  // resilience pattern): an explicit in-session switch wins, else the persisted
  // last-viewed id, with the pure resolver falling back to the first galaxy on
  // anything missing/stale. `null` until the universe AND the stored id have
  // resolved — the `galaxyLoaded` wait (the `useMotionPreference` loaded-gate
  // precedent) is what stops a reload from first painting the first galaxy and
  // then visibly remounting onto the remembered one.
  const currentGalaxy = (() => {
    if (state.status !== "ready" || !galaxyLoaded) return null;
    const resolvedId = resolveStoredGalaxyId(
      currentGalaxyId ?? storedGalaxyId,
      state.universe.galaxies,
    );
    return state.universe.galaxies.find((g) => g.id === resolvedId) ?? null;
  })();

  // The current sky's stars (per-galaxy since PRD 27): the onboarding gate, the
  // create/reset affordances, and the catalog feed all follow THIS galaxy — an
  // empty galaxy honestly shows its invitation even while another sky is full.
  const stars = currentGalaxy?.stars ?? [];

  // The selected star object (for the add-practice / focus-launcher context).
  // null when nothing is selected or while loading.
  const selectedStar =
    state.status === "ready" && selectedStarId
      ? findStarById(state.universe, selectedStarId)
      : null;

  // The body whose page the dock shows (PRD 18) — resolved from the freshest
  // universe each render. A star or a planet; null when nothing is open OR the
  // open body was deleted (the §12.6 resilience pattern: a stale id resolves to
  // null, so the dock closes itself if its body ever vanishes — defence in depth
  // with the delete handlers that also clear openPageBodyId).
  const openBody = (() => {
    if (!openPageBodyId || state.status !== "ready") return null;
    const star = findStarById(state.universe, openPageBodyId as StarId);
    if (star) return { id: star.id, name: star.name, kind: "star" as const };
    const found = findPlanetById(state.universe, openPageBodyId as PlanetId);
    if (found) {
      return {
        id: found.planet.id,
        name: found.planet.name,
        kind: "planet" as const,
      };
    }
    return null;
  })();

  // While a session runs, the selected-star affordances recede (the focus
  // overlay is the mode); they return when the session ends, with the star still
  // selected. Passing null lets each affordance fade out via its own selection-
  // driven AnimatePresence — no extra conditionals.
  const contextStar = runningSession ? null : selectedStar;

  // Home chrome recedes while a star is selected (the unify polish): the screen
  // reconfigures from *home* to *this star*. Keyed on selection (not the running
  // session), so the chrome stays receded through a focus session too.
  const selected = selectedStarId !== null;

  // Resolve the running session's target practice + its parent star for the
  // overlay's context labels (the session carries only the planet id).
  const focusTarget =
    state.status === "ready" && runningSession
      ? findPlanetById(state.universe, runningSession.targetId as PlanetId)
      : null;

  // The practice whose mind is open (PRD 34) + its parent pursuit, resolved
  // fresh each render (the §12.6 resilience pattern: a stale/deleted id resolves
  // to null, so the panel closes itself if its planet ever vanishes).
  const planetMindTarget =
    state.status === "ready" && planetMindTargetId
      ? findPlanetById(state.universe, planetMindTargetId)
      : null;

  // The pursuit whose mind is open (PRD 36), resolved fresh each render (the
  // §12.6 resilience pattern: a stale/deleted id resolves to null, so the panel
  // closes itself if its star ever vanishes).
  const starMindTarget =
    state.status === "ready" && starMindTargetId
      ? findStarById(state.universe, starMindTargetId)
      : null;

  const remainingMs = runningSession
    ? sessionRemainingMs(
        Date.parse(runningSession.startedAt),
        now,
        runningSession.durationMs,
      )
    : 0;

  return (
    // Reduced motion also quiets the DOM overlays' reveal choreography (PRD 15):
    // MotionConfig "always" drops their fade-and-RISE to a plain opacity fade
    // (the upward slide is the motion; the fade is fine). Canvas motion is gated
    // separately, in the loops, via the `reduced` prop on <Observatory>.
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <main className="relative flex h-dvh w-full overflow-hidden">
        {/*
          The canvas region (PRD 18) — the live universe AND every DOM overlay
          live here, and it is their `position: relative` anchor (they resolve
          against it now, not <main>). It grows to fill whatever the dock doesn't
          take (`flex-1`), and `min-w-0` lets it actually shrink when the dock
          claims width (the flexbox min-width:auto gotcha). When the dock is
          closed it IS the whole window, so the app is identical to before the
          split. The R3F canvas sizes to THIS container (100%/100%, never
          100vw/vh) and resizes cleanly when it narrows.
        */}
        <div className="relative h-full min-w-0 flex-1 overflow-hidden">
          {state.status === "ready" && loaded && currentGalaxy && (
            <Observatory
              universe={state.universe}
              // The current sky (PRD 27): Observatory keys <Scene> on this id,
              // so a switch is a fresh mount of the sky (default framing) inside
              // the surviving WebGL context — a context change, not a camera move.
              galaxyId={currentGalaxy.id}
              selectedStarId={selectedStarId}
              // Wrapped (PRD 18): an empty-canvas click (the only source of null)
              // also closes the dock — a decisive "back to the bare universe".
              onSelectStar={handleSelectStar}
              // A click on the galaxy's center (PRD 28) — opens the mind's
              // panel; gated + selection-clearing in the handler.
              onSelectCenter={handleSelectCenter}
              // The camera locks while a session runs (PRD 13); it reads this,
              // never writes session state. resetSignal drives the reset glide.
              cameraLocked={runningSession !== null}
              resetSignal={resetSignal}
              // On star creation the camera glides to center the new star (PRD 24) — the same
              // glide as reset, aimed at the star instead of the origin; reduced motion snaps it.
              flyTo={flyTo}
              // Resolved reduced-motion (PRD 15) — quiets the ambient loops in-scene.
              reduced={reduced}
            />
          )}

          {/*
            DOM overlay layer — layered over the canvas, never inside it
            (r3f-conventions §12). Gated on `ready` so the empty-universe invitation
            never flashes before IndexedDB resolves (during `loading`/`error` the
            canvas and overlay both stay absent — only the wordmark remains).
          */}
          <AnimatePresence>
            {currentGalaxy !== null && stars.length === 0 && (
              <Onboarding key="onboarding" onCreate={handleCreateStar} />
            )}
            {currentGalaxy !== null && stars.length > 0 && (
              <NewPursuitButton
                key="new-pursuit"
                onCreate={handleCreateStar}
                receded={selected}
              />
            )}
          </AnimatePresence>

          {/*
            The galaxy switcher (PRD 27) — the current galaxy's name as a quiet
            always-visible truth in the top-left chrome; clicking it opens a
            small anchored panel (list / rename / "+ new galaxy"). Session-gated
            like the catalog (focus is the one true mode, and a switch
            mid-session is impossible by construction). Strictly cool — a
            switcher is chrome, never an earned glow.
          */}
          {state.status === "ready" && currentGalaxy && !runningSession && (
            <GalaxySwitcher
              galaxies={state.universe.galaxies}
              currentGalaxyId={currentGalaxy.id}
              onSwitch={handleSwitchGalaxy}
              onCreate={handleCreateGalaxy}
              onRename={handleRenameGalaxy}
            />
          )}

          {/*
            Reset-view affordance (PRD 13) — a quiet corner trigger that glides the
            camera back to the default framing. Shown once a universe exists and no
            session runs (the camera is locked during a session, so reset is
            withheld then too). Camera position is ephemeral; this bumps the nonce.
          */}
          <AnimatePresence>
            {currentGalaxy !== null && stars.length > 0 && !runningSession && (
              <ResetViewButton
                key="reset-view"
                onReset={() => setResetSignal((n) => n + 1)}
              />
            )}
          </AnimatePresence>

          {/*
            Settings (PRD 15) — the quiet gear holding the motion toggle. Available
            whenever a universe is ready (even empty — the atmosphere still drifts,
            so a motion-sensitive user needs it there too) and no session runs (the
            focus mode is sacred, like the reset affordance, §12.7).
          */}
          {state.status === "ready" && !runningSession && (
            <SettingsButton
              preference={preference}
              onChangePreference={setPreference}
              // The galaxy's-mind fieldset (PRD 28): the boolean + the two
              // actions only — the key's value never enters the settings
              // panel, so it can never be echoed there.
              hasKey={apiKey !== undefined}
              onSaveKey={saveKey}
              onClearKey={clearKey}
            />
          )}

          {/*
            The star catalog (PRD 25) — a quiet left-edge tab + slide-out panel
            listing every star alphabetically with its practices nested, behind
            a small filter; clicking a row selects that star and fires the
            PRD 24 fly-to glide (handleNavigateToStar). An absolute overlay
            (never a flex split — the canvas does not resize). Honest: hidden
            at 0 stars (nothing to catalog) and while a session runs (focus is
            the one true mode; the camera is locked then anyway).
          */}
          {currentGalaxy !== null && stars.length > 0 && !runningSession && (
            <StarCatalog
              // Keyed on the galaxy (PRD 27): a switch remounts the catalog —
              // open state + filter drop with the old sky, the explicit clear.
              key={currentGalaxy.id}
              stars={stars}
              onNavigate={handleNavigateToStar}
            />
          )}

          {/*
            The center panel (PRD 28) — the black hole's surface, the galaxy's
            mind. An absolute overlay over the canvas region (never a flex
            split). Opened only by the center's click; session-gated at the
            mount (a session start unmounts it mid-open, like the dock), and
            closing/unmounting aborts any in-flight distill call. The fog and
            signal inside are ephemeral — unmount forgets them. Strictly cool;
            the only warm element in the flow is the create form's caret.
          */}
          <AnimatePresence>
            {currentGalaxy !== null && !runningSession && centerOpen && (
              <CenterPanel
                key="center-panel"
                galaxyName={currentGalaxy.name}
                focusedMinutes={galaxyFocusedMinutes(currentGalaxy)}
                apiKey={apiKey}
                onClose={() => setCenterOpen(false)}
                onCreatePursuit={(name, description) => {
                  // The HUMAN confirmed the offer. Close the mind's panel
                  // first so the EXISTING create path's glide (PRD 24)
                  // presents the new star unobscured — fog → signal →
                  // human-confirmed pursuit → the universe presents it.
                  setCenterOpen(false);
                  void handleCreateStar(name, description);
                }}
              />
            )}
          </AnimatePresence>

          {/*
            The planet mind (PRD 34) — a practice's mind, opened from its
            StarContext "mind" affordance. An absolute overlay over the canvas
            region (the CenterPanel family; the canvas never resizes).
            Session-gated at the mount (focus is the one true mode) and keyed on
            the practice id (a fresh panel per practice). The ONLY way a note
            reaches the mind is the consented bridge read passed as `readNotes`;
            consent is per-planet, default off. The mind PROPOSES a note change
            (PRD 35); the HUMAN commits it via `onApplyProposal` → the existing
            page editor, prefilled. The mind writes nothing; no body offer.
          */}
          <AnimatePresence>
            {currentGalaxy !== null && !runningSession && planetMindTarget && (
              <PlanetMindPanel
                key={planetMindTarget.planet.id}
                planetId={planetMindTarget.planet.id}
                planetName={planetMindTarget.planet.name}
                starName={planetMindTarget.star.name}
                apiKey={apiKey}
                isConsented={isConsented(planetMindTarget.planet.id)}
                onSetConsent={(on) =>
                  setConsent(planetMindTarget.planet.id, on)
                }
                readNotes={readConsentedPlanetNotes}
                onApplyProposal={(newNoteText) =>
                  // The HUMAN approved a proposed note change (PRD 35) — route
                  // the full new note text into the EXISTING page editor for this
                  // practice, prefilled + editable. The mind writes nothing; the
                  // editor (a human surface) commits it.
                  handleApproveProposal(planetMindTarget.planet.id, newNoteText)
                }
                onClose={() => setPlanetMindTargetId(null)}
              />
            )}
          </AnimatePresence>

          {/*
            The star mind (PRD 36) — a pursuit's mind, opened from its
            StarContext "mind" affordance at the star level. An absolute overlay
            over the canvas region (the PlanetMindPanel family; the canvas never
            resizes). Session-gated at the mount (focus is the one true mode) and
            keyed on the star id (a fresh panel per pursuit). The ONLY way a note
            reaches the mind is the consented bridge read passed as `readNotes`,
            with the star's subtree resolved HERE (`starSubtreeForMind`) so the
            bridge stays import-clean of `@/universe`; consent is per-star, default
            off, and the read is capped in code. The mind PROPOSES a note change
            that NAMES its target; the HUMAN commits it via `onApplyProposal` → the
            named body's existing page editor, prefilled. The mind writes nothing;
            no body offer.
          */}
          <AnimatePresence>
            {currentGalaxy !== null && !runningSession && starMindTarget && (
              <StarMindPanel
                key={starMindTarget.id}
                starId={starMindTarget.id}
                starName={starMindTarget.name}
                galaxyName={currentGalaxy.name}
                apiKey={apiKey}
                isConsented={isStarConsented(starMindTarget.id)}
                onSetConsent={(on) => setStarConsent(starMindTarget.id, on)}
                readNotes={(id) =>
                  readConsentedStarNotes(id, {
                    resolveSubtree: starSubtreeForMind,
                  })
                }
                onApplyProposal={(targetBodyId, newNoteText) =>
                  // The HUMAN approved a proposed note change (PRD 36) — route the
                  // full new note text into the EXISTING page editor for the NAMED
                  // body, prefilled + editable. The mind writes nothing.
                  handleApproveStarProposal(targetBodyId, newNoteText)
                }
                onClose={() => setStarMindTargetId(null)}
              />
            )}
          </AnimatePresence>

          {/*
            The selected-star context (§12.6) — one cohesive, anchored panel (the
            unify polish): star name (+ notes/edit/delete) → demoted "begin a focus
            session" caption → practice list (click-to-focus; per-practice
            notes/edit/delete/+sub; moon sub-lists) → "+ add practice". The "notes"
            action opens that body's page in the dock (PRD 18). It recedes while a
            session runs (contextStar → null). Mounted whenever ready; owns its own
            fade in/out.
          */}
          {state.status === "ready" && (
            <StarContext
              selectedStar={contextStar}
              onAddPractice={handleCreatePlanet}
              onDeselect={() => setSelectedStarId(null)}
              onOpenPage={setOpenPageBodyId}
              onOpenPlanetMind={handleOpenPlanetMind}
              onOpenStarMind={handleOpenStarMind}
              onEditStar={handleEditStar}
              onDeleteStar={handleDeleteStar}
              defaultDurationMinutes={msToMinutes(lastUsedMs)}
              onBeginFocus={handleBeginFocus}
              onCreateMoon={handleCreateMoon}
              onEditPlanet={handleEditPlanet}
              onDeletePlanet={handleDeletePlanet}
              onEditMoon={handleEditMoon}
              onDeleteMoon={handleDeleteMoon}
            />
          )}

          {/*
            The focus overlay — the one justified mode (§12.7). Its faint void
            backdrop quiets the sky (a DOM scrim; the canvas stays untouched). Shown
            only while a session runs; fades in/out via AnimatePresence.
          */}
          <AnimatePresence>
            {runningSession && focusTarget && (
              <FocusSession
                key="focus-session"
                remainingMs={remainingMs}
                practiceName={focusTarget.planet.name}
                starName={focusTarget.star.name}
                onAbandon={handleAbandon}
              />
            )}
          </AnimatePresence>

          {/*
            In-session notes (PRD 20) — a thin slide-out tab, present only while a
            session runs, that reveals the sessioned practice's OWN page (the same
            usePage note + read/edit toggle as the dock, reached through a new
            door). An absolute overlay over the focus scrim (NOT a flex sibling
            like the dock), so the canvas never resizes mid-session and the timer
            stays visible. We pass only what it READS — the sessioned planet's id +
            name from `focusTarget` (the running session carries the planet id);
            it never touches session state. It vanishes when the session ends.
          */}
          {runningSession && focusTarget && (
            <InSessionNotes
              bodyId={focusTarget.planet.id}
              bodyName={focusTarget.planet.name}
            />
          )}

          {/*
            The wordmark + "universe created" date — home chrome (`Wordmark`).
            While a star is selected they fully UNMOUNT (PRD 30 — the unify
            polish's recede, completed: a ghosted wordmark could still collide
            with the StarContext column); both restore on deselect. Opacity-only,
            through the page `<MotionConfig>` (reduced-motion-safe).
          */}
          <Wordmark
            selected={selected}
            createdAt={state.status === "ready" ? state.universe.createdAt : null}
          />
        </div>

        {/*
          The page dock (PRD 18) — a true SIBLING of the canvas region, so the
          universe genuinely narrows beside it (a split, not a panel over the sky).
          Mounted only when a body's page is open and no session runs; the width is
          a fixed class (instant split → one canvas resize), AnimatePresence fades
          the content in/out through the page <MotionConfig> (reduced-motion drops
          the slide). usePage lives inside PageDock, so closing/switching flushes
          the pending autosave. (§12.11)
        */}
        <AnimatePresence>
          {openBody && !runningSession && (
            <PageDock
              // A fresh approved-proposal draft (PRD 35/36) remounts the dock so
              // the prefill + edit-mode apply regardless of any prior open state;
              // the stable "page-dock" key otherwise (the dock survives body
              // switches).
              key={
                pageDraft && pageDraft.bodyId === openBody.id
                  ? `page-dock-draft-${pageDraft.bodyId}`
                  : "page-dock"
              }
              bodyId={openBody.id}
              bodyName={openBody.name}
              kind={openBody.kind}
              onClose={() => setOpenPageBodyId(null)}
              // The approved proposal's new note text, only for the matching body
              // (the human-confirmed save path persists it; the mind never).
              draft={
                pageDraft && pageDraft.bodyId === openBody.id
                  ? pageDraft.text
                  : undefined
              }
            />
          )}
        </AnimatePresence>
      </main>
    </MotionConfig>
  );
}
