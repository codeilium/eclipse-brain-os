"use client";

import { useMemo, type RefObject } from "react";

import type { GalaxyId, StarId, Universe } from "@/universe";

import { Atmosphere } from "./atmosphere";
import { Camera } from "./Camera";
import { panBoundForExtent } from "./camera-controls";
import type { CameraFlyTo } from "./camera-controls";
import { BlackHole } from "./center";
import { maxSystemExtent } from "./layout";
import { PerfGovernor } from "./PerfGovernor";
import { ReducedMotionProvider } from "./reduced-motion";
import { SYSTEM_VISUAL_SCALE } from "./scale";
import { Stars } from "./stars";

interface SceneProps {
  readonly universe: Universe;
  /**
   * The current galaxy's id (PRD 27) — which sky is on screen. Owned by
   * `page.tsx` (ephemeral view state, like `selectedStarId`) and threaded down;
   * `Observatory` also KEYS this component on it, so a galaxy switch is a fresh
   * mount of the whole sky (camera at default framing) inside the surviving
   * WebGL context — a context change, never a camera move.
   */
  readonly galaxyId: GalaxyId;
  /** The selected star's id (down) — the canvas marks it, never owns it (§12.6). */
  readonly selectedStarId: StarId | null;
  /** Reports a star click / empty-space deselect up to `page.tsx` (§12.6). */
  readonly onSelectStar: (id: StarId | null) => void;
  /** Reports a click on the galaxy's center up to `page.tsx` (PRD 28, §12.6). */
  readonly onSelectCenter: () => void;
  /** True while a focus session runs — the camera locks (PRD 13). */
  readonly cameraLocked: boolean;
  /** Nonce that triggers the camera's reset-view glide (PRD 13). */
  readonly resetSignal: number;
  /** Fly-to trigger (PRD 24): nonce + target — glides the camera to center a new star. */
  readonly flyTo: CameraFlyTo;
  /** Shared pan-drag flag so a pan doesn't read as a star deselect (§12.6 / PRD 13). */
  readonly draggedRef: RefObject<boolean>;
  /** The live adaptive DPR ceiling, owned by `Observatory` (PRD 14). */
  readonly dprCeiling: number;
  /** Reports a measured-slowness DPR downgrade up to `Observatory` (PRD 14). */
  readonly onDowngrade: (nextCeiling: number) => void;
  /** Resolved "reduce motion?" (PRD 15) — provided to the canvas subtree below. */
  readonly reduced: boolean;
}

/**
 * The contents of the Observatory canvas. Receives the persisted universe as
 * a prop. Renders the ambient camera, the performance governor (PRD 14 — a
 * logic component, no visuals), the lights, the atmosphere (PRD 4), and the
 * stars (PRD 6) — the user's pursuits made visible.
 *
 * The honest-universe principle: every body that appears here maps 1:1 to a
 * real entity in the universe data. Empty universe → no bodies. The atmosphere
 * (gradient + motes) is allowed regardless of universe state because it is the
 * *medium*, not the contents (see r3f-conventions.md §2.1).
 *
 * Lights kept minimal per the performance budget (≤2 dynamic lights). One
 * faint ambient for general illumination, one weak directional for any
 * bodies that need a sense of depth.
 *
 * PRD 7 will add planets to the same pattern (one mesh per planet, mapped over
 * star.planets), composing into this same Scene.
 */
export function Scene({
  universe,
  galaxyId,
  selectedStarId,
  onSelectStar,
  onSelectCenter,
  cameraLocked,
  resetSignal,
  flyTo,
  draggedRef,
  dprCeiling,
  onDowngrade,
  reduced,
}: SceneProps) {
  // The rendered galaxy (PRD 27): resolved fresh from the threaded id each
  // render (the §12.6 resilience pattern — a stale id falls back to the first
  // galaxy, so the sky can never strand). <BlackHole> and <Stars> both consume
  // THIS galaxy, so the heart and the stars always agree on which sky is shown.
  const galaxy =
    universe.galaxies.find((g) => g.id === galaxyId) ?? universe.galaxies[0];

  // The live pan bound (PRD 23, scoped per galaxy in PRD 27): it tracks the
  // RENDERED galaxy's largest system extent so a grown system's outer planets
  // stay reachable — and a grown system in another sky never inflates this
  // one's bounds. Memoized on the galaxy (sizes change only on a data mutation
  // — never on the 60s nowMs tick, which is local to <Stars> and never reaches
  // here). `maxSystemExtent` is unscaled; scale it to world units, exactly as
  // the bodies are scaled, before deriving the bound. Empty galaxy → 0 → the
  // bound falls back to its floor.
  const panBound = useMemo(
    () =>
      panBoundForExtent(
        (galaxy ? maxSystemExtent(galaxy) : 0) * SYSTEM_VISUAL_SCALE,
      ),
    [galaxy],
  );

  // Provide the reduced-motion signal to the whole canvas subtree (PRD 15). The
  // ambient `useFrame` loops (camera drift, dust motes, planet/moon spin+glide)
  // read it via `useReducedMotion()` and quiet when it is true — without
  // per-frame querying or per-body prop drilling (r3f-conventions.md §6.4).
  return (
    <ReducedMotionProvider reduced={reduced}>
      <Camera
        locked={cameraLocked}
        resetSignal={resetSignal}
        flyTo={flyTo}
        draggedRef={draggedRef}
        panBound={panBound}
      />
      <PerfGovernor dprCeiling={dprCeiling} onDowngrade={onDowngrade} />
      <ambientLight intensity={0.15} />
      <directionalLight position={[2, 3, 4]} intensity={0.3} />
      <Atmosphere />
      {/* The galaxy's center (PRD 26) — the black hole. A BODY, not atmosphere:
          it maps 1:1 to the Galaxy entity (honest-universe, §2), present from
          the galaxy's creation; its accretion *light* is derived from the
          galaxy's persisted focus — earned, never decorative. Since PRD 28 it
          is clickable (a generous invisible hit disc — the mind's door);
          empty-space clicks away from it still deselect, untouched. */}
      {galaxy && <BlackHole galaxy={galaxy} onSelectCenter={onSelectCenter} />}
      {galaxy && (
        <Stars
          galaxy={galaxy}
          selectedStarId={selectedStarId}
          onSelectStar={onSelectStar}
        />
      )}
    </ReducedMotionProvider>
  );
}
