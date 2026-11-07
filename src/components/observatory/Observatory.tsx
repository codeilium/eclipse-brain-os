"use client";

import { useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";

import { color } from "@/design/tokens";
import type { GalaxyId, StarId, Universe } from "@/universe";

import type { CameraFlyTo } from "./camera-controls";
import { DPR_CEILING } from "./perf";
import { Scene } from "./Scene";

interface ObservatoryProps {
  readonly universe: Universe;
  /**
   * The current galaxy's id (PRD 27) — which sky to show. Owned by `page.tsx`
   * (ephemeral view state, like `selectedStarId`, with the last-viewed id
   * remembered in settings). The `<Scene>` subtree is KEYED on it: switching
   * galaxies remounts the sky (camera refs land at the default framing) while
   * the `<Canvas>` — and so the WebGL context — survives. A context change,
   * never a camera move: no glide between skies (r3f-conventions §12.16).
   */
  readonly galaxyId: GalaxyId;
  /**
   * The currently-selected star's id, or null when nothing is selected.
   * Owned by `page.tsx` (ephemeral UI state, never persisted) and passed *down*
   * — the canvas renders a selection indicator on the matching star but never
   * owns selection state itself (r3f-conventions.md §12.6).
   */
  readonly selectedStarId: StarId | null;
  /**
   * Reports a selection *up* to `page.tsx`: a star's id when a star is clicked,
   * or null when empty space is clicked (deselect). This is the canvas→DOM
   * event channel — interactions flow up via callback, just as DOM components
   * report up via `onCreate` (§12.6).
   */
  readonly onSelectStar: (id: StarId | null) => void;
  /**
   * Reports a click on the galaxy's center *up* to `page.tsx` (PRD 28 — opens
   * the center panel). Same channel as `onSelectStar`; the center's hit disc
   * stops propagation, so this never doubles as an empty-space miss.
   */
  readonly onSelectCenter: () => void;
  /**
   * True while a focus session is running (PRD 11). Passed to the camera, which
   * locks zoom/pan while it holds (PRD 13). Read-only — the canvas never changes
   * session state.
   */
  readonly cameraLocked: boolean;
  /**
   * A nonce from the DOM "reset view" affordance; each increment glides the
   * camera back to the default framing (PRD 13).
   */
  readonly resetSignal: number;
  /**
   * Fly-to trigger (PRD 24): a nonce + world-space pan target. `page.tsx` bumps it on star
   * creation; the camera glides to center the new star at the default overview zoom (the same
   * glide as reset-view, aimed at the star instead of the origin). Read-only — threaded down.
   */
  readonly flyTo: CameraFlyTo;
  /**
   * The resolved "reduce motion?" value (PRD 15) — OS `prefers-reduced-motion`
   * combined with the user's settings override. Threaded down as a single prop
   * (like `cameraLocked`) and re-provided to the canvas subtree by `Scene`, so
   * the ambient `useFrame` loops quiet without per-frame querying. Read-only.
   */
  readonly reduced: boolean;
}

/**
 * The Observatory — the cinematic 3D scene the user enters when they open
 * Eclipse Brain OS. A fullscreen R3F canvas with the locked performance
 * budget enforced: DPR clamped to [1, DPR_CEILING] for integrated AMD Vega 8,
 * the canvas's clear color set to the design token `void`, and no
 * postprocessing.
 *
 * The DPR ceiling is **adaptive** (PRD 14): it mounts at full quality
 * (`DPR_CEILING`) every session and is only ever lowered toward 1 — and only on
 * measured, sustained slowness reported up by the in-scene `PerfGovernor`. A
 * capable machine is never preemptively degraded. The ceiling lives in React
 * state here (Observatory owns the `<Canvas>` and its perf settings) and is
 * driven through the `dpr` prop, which is the clobber-free mechanism in the
 * installed R3F: its per-render reconfigure recomputes `setDpr` idempotently
 * from the current state, so an imperative `setDpr` would be undone but a
 * state-driven prop is not (r3f-conventions.md §5.2). Ephemeral, never persisted
 * — each load re-measures from full quality.
 *
 * The Observatory receives the persisted universe as a prop (read by
 * `page.tsx` via `useUniverse()`) and passes it through to the Scene. This
 * one-way data flow keeps the Canvas testable in isolation and avoids
 * coupling the rendering layer to the persistence layer.
 *
 * Children: the Scene component, which composes the camera + lights and
 * (in later PRDs) the visual bodies.
 */
export function Observatory({
  universe,
  galaxyId,
  selectedStarId,
  onSelectStar,
  onSelectCenter,
  cameraLocked,
  resetSignal,
  flyTo,
  reduced,
}: ObservatoryProps) {
  // Set true by the camera control when a gesture becomes a pan (PRD 13), so a
  // pan-drag over empty space is NOT read as a deselect-click below. Lives here
  // (not in page.tsx) so the camera-drag concern stays inside the canvas subtree.
  const draggedRef = useRef(false);

  // Adaptive DPR ceiling (PRD 14). Starts at full quality every session; the
  // in-scene PerfGovernor lowers it toward 1 only on measured sustained
  // slowness. State-driven (not imperative setDpr) so R3F's per-render
  // reconfigure can't clobber it. Ephemeral — never persisted (re-measured each
  // load).
  const [dprCeiling, setDprCeiling] = useState(DPR_CEILING);

  return (
    <Canvas
      // Locked perf budget: DPR clamped to [1, DPR_CEILING]; never render at full
      // 4K. The ceiling is adaptive — the PerfGovernor lowers it toward 1 on
      // sustained measured slowness (PRD 14). Effective DPR = min(devicePixelRatio,
      // dprCeiling).
      dpr={[1, dprCeiling]}
      // Default camera; the Camera component overrides position each frame
      camera={{ position: [0, 0, 5], fov: 60, near: 0.1, far: 100 }}
      // Performance-conscious GL settings
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(color.void, 1);
      }}
      // Deselect on empty-space click. onPointerMissed fires when a click hits
      // no event-handling mesh — the atmosphere (gradient + motes) carries no
      // pointer handlers, so clicking the void deselects. Only the star bodies
      // handle clicks (and stopPropagation), so a star click is not a "miss".
      // Guard: a pan-drag that ends on empty space must NOT deselect — the
      // camera control sets draggedRef while panning; consume it here (PRD 13).
      onPointerMissed={() => {
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        onSelectStar(null);
      }}
      // Fill the parent; the parent in page.tsx is h-dvh w-full. touchAction
      // none so the camera control owns touch gestures (one-finger pan, pinch
      // zoom) instead of the browser scrolling/zooming the page (PRD 13).
      style={{ width: "100%", height: "100%", touchAction: "none" }}
    >
      <Scene
        // The galaxy switch IS this key (PRD 27): a new id remounts the whole
        // sky — camera at default framing, fresh ambient state — inside the
        // surviving Canvas/WebGL context. Zero camera code involved.
        key={galaxyId}
        universe={universe}
        galaxyId={galaxyId}
        selectedStarId={selectedStarId}
        onSelectStar={onSelectStar}
        onSelectCenter={onSelectCenter}
        cameraLocked={cameraLocked}
        resetSignal={resetSignal}
        flyTo={flyTo}
        draggedRef={draggedRef}
        dprCeiling={dprCeiling}
        onDowngrade={setDprCeiling}
        reduced={reduced}
      />
    </Canvas>
  );
}
