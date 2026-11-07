"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { PerspectiveCamera, Vector3 } from "three";

import {
  CONTROL_TAU,
  DEFAULT_ZOOM,
  DRAG_THRESHOLD_PX,
  RESET_TAU,
  WHEEL_ZOOM_SENSITIVITY,
  clampPanAxis,
  clampZoom,
  dampTo,
  keyboardPanWorldStep,
  keyboardZoomStep,
  mapKeyToCameraAction,
  nextIdleFactor,
  panWorldDelta,
  zoomTowardCursor,
} from "./camera-controls";
import type { CameraFlyTo } from "./camera-controls";
import { ambientPhase, lissajous } from "./motion";
import { useReducedMotion } from "./reduced-motion";

interface CameraProps {
  /**
   * True while a focus session is running (PRD 11). The camera locks: all
   * zoom/pan input no-ops and the view holds where it was. The ambient drift
   * keeps breathing around the held view (matching the pre-PRD-13 behavior; the
   * DOM scrim does the sky-quieting — r3f-conventions.md §12.7). The camera
   * *reads* the session state; it never modifies it.
   */
  readonly locked: boolean;
  /**
   * A monotonically-increasing nonce. Each increment (from the DOM "reset view"
   * affordance) triggers a smooth, eased glide back to the default framing
   * (centered, DEFAULT_ZOOM) — never a snap. `0` is the initial mount (no reset).
   */
  readonly resetSignal: number;
  /**
   * Shared with `Observatory`'s `onPointerMissed`: set true once a gesture
   * becomes a pan (movement past the drag threshold), so a pan over empty space
   * does NOT deselect a star. Reset at the start of each gesture. Star selection
   * itself is guarded separately by R3F's `event.delta` in `Star.tsx` (§12.6).
   */
  readonly draggedRef: RefObject<boolean>;
  /**
   * The live pan bound (world units) — how far the view may pan from the origin
   * on each axis. Tracks the universe's largest system extent (PRD 23 —
   * `panBoundForExtent`, computed in `Scene` from `maxSystemExtent`), with a
   * floor of `MIN_PAN_BOUND`, so a grown system's outer planets stay reachable.
   * Read via a ref so the mount-once input listeners always see the current value.
   */
  readonly panBound: number;
  /**
   * Fly-to trigger (PRD 24). A nonce + world-space pan target; each increment glides the camera
   * to center that point at the default overview zoom — the SAME glide as the reset-view, just
   * aimed at a new star's position instead of the origin (`page.tsx` fires it on star creation).
   * `signal === 0` is the initial mount (no glide). Reduced motion snaps it (inherited).
   */
  readonly flyTo: CameraFlyTo;
}

/**
 * The Observatory camera — a custom lightweight control (PRD 13). It is the
 * single owned source of truth for the camera: an ephemeral pan target (x, y in
 * the z=0 sky plane) and a zoom DISTANCE, driven by user input (wheel/pinch
 * zoom, drag pan), with the project's ambient Lissajous drift composed on top as
 * an idle-gated offset. One `useFrame` composes both; no per-frame allocations.
 *
 * Why custom, not a drei control: a drei `MapControls`/`OrbitControls` *owns*
 * `camera.position` each frame and would fight the ambient drift (two writers).
 * A custom control lets drift + user input compose on one owned camera —
 * `camera.position = (pan.x, pan.y, zoom) + driftOffset·idleFactor` — which is
 * exactly what the idle-only-drift requirement wants. The drift here is the same
 * `motion.ts` call that PRD 3 used, now re-centered on the user's view instead
 * of the origin. (See r3f-conventions.md §8.)
 *
 * Hard constraints: **zoom + pan, never rotate** — the camera always looks
 * straight at the z=0 plane (the composed near-2D sky stays the right way up);
 * **clamped** zoom/pan keep the populated universe always reachable; the camera
 * **locks** during a focus session. Camera position is **ephemeral view state**
 * — never persisted, never in the universe model.
 *
 * Returns `null` — a logic component (the body-rendering convention §4).
 */
export function Camera({
  locked,
  resetSignal,
  draggedRef,
  panBound,
  flyTo,
}: CameraProps) {
  const { camera, gl } = useThree();

  // Read `locked` via a ref so the (mount-once) input listeners always see the
  // current value without re-attaching on every session start/stop.
  const lockedRef = useRef(locked);
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  // Likewise read the live pan bound via a ref (PRD 23): it grows with the
  // universe's system extent, but the input listeners are attached once — so they
  // clamp against `panBoundRef.current`, which this effect keeps current. A
  // grown universe simply has a larger reachable region; no re-attach needed.
  const panBoundRef = useRef(panBound);
  useEffect(() => {
    panBoundRef.current = panBound;
  }, [panBound]);

  // Reduced-motion signal (PRD 15). Read once; gated per frame via the ref — no
  // per-frame media-query query (r3f-conventions.md §6.4). When reduced, the
  // ambient idle-drift holds still and the reset-view glide resolves quickly.
  const reducedRef = useReducedMotion();

  // --- Ephemeral view state (refs — never React state, never persisted) ---
  // Targets are set instantly by input (clamped); current values ease toward
  // them each frame. At rest both equal the default framing (matches the
  // <Canvas> camera at [0, 0, 5]).
  const targetPan = useRef({ x: 0, y: 0 });
  const currentPan = useRef({ x: 0, y: 0 });
  const targetZoom = useRef(DEFAULT_ZOOM);
  const currentZoom = useRef(DEFAULT_ZOOM);

  // Drift clock + idle state. The scene breathes from mount (idleFactor 1,
  // last-interaction in the infinite past), exactly as it did pre-PRD-13.
  const elapsed = useRef(0);
  const lastInteractMs = useRef(Number.NEGATIVE_INFINITY);
  const idleFactor = useRef(1);
  const isDragging = useRef(false);

  // Glide mode: when true, the current values ease to the TARGET (the origin on
  // reset-view, or a new star's position on creation — PRD 24) over the slow
  // RESET_TAU instead of the brisk CONTROL_TAU. Cleared on arrival or on any new input.
  const gliding = useRef(false);

  // Gesture bookkeeping (pointer tracking for pan + pinch).
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const lastPanPos = useRef<{ x: number; y: number } | null>(null);
  const pinchPrevDist = useRef<number | null>(null);

  // Reused scratch for the lookAt target — allocated once, mutated in place.
  const lookTarget = useRef(new Vector3());

  // --- Glide to a target framing: ease to (targetPan, DEFAULT_ZOOM) (smooth, not a snap) ---
  // The ONE generalized glide path (PRD 24). Reset-view triggers it with the origin; star
  // creation triggers it with the new star's world position. The target is clamped to the live
  // pan bound so any in-disk star is centerable (a no-op for valid stars; keeps reset's origin
  // exactly 0). Stable (touches only refs + module constants), so the input-listener + signal
  // effects can depend on it without re-attaching.
  const triggerGlide = useCallback((targetX: number, targetY: number) => {
    targetPan.current.x = clampPanAxis(targetX, panBoundRef.current);
    targetPan.current.y = clampPanAxis(targetY, panBoundRef.current);
    targetZoom.current = DEFAULT_ZOOM;
    gliding.current = true;
    // Treat the glide as an interaction so the breathing settles during it, then resumes around
    // the new view (the origin on reset, the new star on creation) once idle.
    lastInteractMs.current = performance.now();
  }, []);

  // Reset-view is the ORIGIN case of the glide — kept as its own stable callback so BOTH the DOM
  // "reset view" affordance (the resetSignal nonce) and the keyboard reset key ("0", PRD 15)
  // trigger the *same* glide via one owned path (r3f-conventions.md §8.1).
  const triggerReset = useCallback(() => triggerGlide(0, 0), [triggerGlide]);

  useEffect(() => {
    if (resetSignal === 0) return; // initial mount — nothing to reset
    triggerReset();
  }, [resetSignal, triggerReset]);

  // Star creation (PRD 24): glide to center the new star at the default overview zoom — the same
  // glide as reset, aimed at the star's position. Mirrors the resetSignal effect; fires only on a
  // real signal bump (0 is the initial mount). Reduced motion snaps it (the tau in useFrame).
  useEffect(() => {
    if (flyTo.signal === 0) return; // initial mount — nothing to fly to
    triggerGlide(flyTo.x, flyTo.y);
  }, [flyTo, triggerGlide]);

  // --- Native input listeners (attached once; lock/state read via refs) ---
  useEffect(() => {
    // The canvas carries `touch-action: none` (set on the <Canvas> style in
    // Observatory) so one- and two-finger gestures are ours to interpret as
    // pan/pinch rather than browser scroll/zoom.
    const el = gl.domElement;

    const fovRad = () => ((camera as PerspectiveCamera).fov * Math.PI) / 180;
    const ndc = (clientX: number, clientY: number, rect: DOMRect) => ({
      x: ((clientX - rect.left) / rect.width) * 2 - 1,
      y: -(((clientY - rect.top) / rect.height) * 2 - 1),
    });
    const twoPointers = () => {
      const pts = [...pointers.current.values()];
      return [pts[0], pts[1]] as const;
    };

    // Any zoom/pan input refreshes the idle clock and cancels an in-progress glide
    // (reset-view or fly-to-new-star) — the user's hand takes over with the brisk free-mode τ.
    const markInteract = () => {
      lastInteractMs.current = performance.now();
      gliding.current = false;
    };

    // Apply a zoom toward a focal screen point (cursor or pinch midpoint),
    // keeping the world point under it fixed, then clamp pan + zoom.
    const applyZoom = (newZoomRaw: number, focusX: number, focusY: number) => {
      const rect = el.getBoundingClientRect();
      const oldZoom = targetZoom.current;
      const newZoom = clampZoom(newZoomRaw);
      const p = ndc(focusX, focusY, rect);
      const [npx, npy] = zoomTowardCursor(
        targetPan.current.x,
        targetPan.current.y,
        oldZoom,
        newZoom,
        p.x,
        p.y,
        fovRad(),
        rect.width / rect.height,
      );
      targetZoom.current = newZoom;
      targetPan.current.x = clampPanAxis(npx, panBoundRef.current);
      targetPan.current.y = clampPanAxis(npy, panBoundRef.current);
    };

    const onWheel = (e: WheelEvent) => {
      if (lockedRef.current) return;
      e.preventDefault(); // don't scroll the page
      markInteract();
      // Multiplicative step: scroll up (deltaY < 0) zooms in (smaller distance).
      applyZoom(
        targetZoom.current * Math.exp(e.deltaY * WHEEL_ZOOM_SENSITIVITY),
        e.clientX,
        e.clientY,
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      if (lockedRef.current) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // A fresh gesture: assume a click until movement proves it a drag.
      draggedRef.current = false;
      if (pointers.current.size === 1) {
        pointerDownPos.current = { x: e.clientX, y: e.clientY };
        lastPanPos.current = { x: e.clientX, y: e.clientY };
      } else if (pointers.current.size === 2) {
        const [a, b] = twoPointers();
        if (a && b) {
          pinchPrevDist.current = Math.hypot(a.x - b.x, a.y - b.y);
          isDragging.current = true; // a two-finger gesture is active navigation
          markInteract();
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (lockedRef.current) return;
      if (!pointers.current.has(e.pointerId)) return; // only canvas-born pointers
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Two pointers → pinch zoom about the midpoint.
      if (pointers.current.size >= 2) {
        const [a, b] = twoPointers();
        if (!a || !b) return;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchPrevDist.current != null && dist > 0) {
          // Fingers apart (dist↑) → ratio < 1 → smaller distance → zoom in.
          const ratio = pinchPrevDist.current / dist;
          applyZoom(
            targetZoom.current * ratio,
            (a.x + b.x) / 2,
            (a.y + b.y) / 2,
          );
        }
        pinchPrevDist.current = dist;
        markInteract();
        return;
      }

      // One pointer → pan. Hold off until movement passes the drag threshold so
      // a small wobble still counts as a click (select), not a pan.
      const last = lastPanPos.current;
      const down = pointerDownPos.current;
      if (!last || !down) return;
      if (!isDragging.current) {
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < DRAG_THRESHOLD_PX) {
          return;
        }
        isDragging.current = true;
        draggedRef.current = true; // this gesture is a pan — suppress deselect
      }
      const rect = el.getBoundingClientRect();
      const [wdx, wdy] = panWorldDelta(
        e.clientX - last.x,
        e.clientY - last.y,
        targetZoom.current,
        rect.height,
        fovRad(),
      );
      targetPan.current.x = clampPanAxis(targetPan.current.x + wdx, panBoundRef.current);
      targetPan.current.y = clampPanAxis(targetPan.current.y + wdy, panBoundRef.current);
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      markInteract();
    };

    const endPointer = (e: PointerEvent) => {
      if (!pointers.current.delete(e.pointerId)) return;
      if (pointers.current.size < 2) pinchPrevDist.current = null;
      if (pointers.current.size === 0) {
        isDragging.current = false;
        pointerDownPos.current = null;
        lastPanPos.current = null;
        // Leave draggedRef as-is: onPointerMissed (fired on the click that
        // follows pointerup) reads it to skip a post-pan deselect; the next
        // pointerdown resets it.
      } else if (pointers.current.size === 1) {
        // A finger lifted from a pinch — continue panning with the one left.
        const [remaining] = [...pointers.current.values()];
        if (remaining) {
          pointerDownPos.current = { x: remaining.x, y: remaining.y };
          lastPanPos.current = { x: remaining.x, y: remaining.y };
        }
      }
    };

    // Keyboard camera (PRD 15) — another input feeding the SAME view-state.
    // Arrow/WASD pan, +/-/PageUp/Down zoom, 0 reset; no rotation. It nudges the
    // same targetPan/targetZoom (through the same clamps) and marks interaction,
    // so the composing useFrame eases + composes the idle drift exactly as for
    // the mouse. Respects the focus-session lock like every other input.
    const onKeyDown = (e: KeyboardEvent) => {
      if (lockedRef.current) return; // session running — camera input no-ops
      if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser/OS chords
      // Only act when focus is on the page/canvas — never when a text field or an
      // overlay control (the settings radios, an open form) is focused. This
      // keeps us from hijacking typing or overlay keyboard nav, and from
      // preventing-default their keys. (`null` activeElement counts as the body.)
      const active = document.activeElement;
      if (active && active !== document.body && active !== el) return;
      const action = mapKeyToCameraAction(e.key);
      if (!action) return;
      e.preventDefault(); // we own these keys (arrows/PageUp/space would scroll)
      if (action.kind === "reset") {
        triggerReset();
        return;
      }
      if (action.kind === "zoom") {
        targetZoom.current = keyboardZoomStep(targetZoom.current, action.dir);
      } else {
        const step = keyboardPanWorldStep(targetZoom.current, fovRad());
        targetPan.current.x = clampPanAxis(
          targetPan.current.x + action.dx * step,
          panBoundRef.current,
        );
        targetPan.current.y = clampPanAxis(
          targetPan.current.y + action.dy * step,
          panBoundRef.current,
        );
      }
      markInteract();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onPointerDown);
    // move/up on window so a drag that leaves the canvas still tracks, and so a
    // drag that ends off-canvas does not synthesize a canvas `click` (R3F's
    // onClick/onPointerMissed correctly never fires for it).
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endPointer);
    window.addEventListener("pointercancel", endPointer);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endPointer);
      window.removeEventListener("pointercancel", endPointer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [gl, camera, draggedRef, triggerReset]);

  // --- The one composing useFrame (ease + idle-gated drift; no allocations) ---
  useFrame((_, delta) => {
    elapsed.current += delta * 1000; // delta s → ms for the drift clock

    // Ease the base (pan + zoom) toward its target. Glide mode (reset-view OR fly-to-new-star,
    // PRD 24) uses the slow cinematic τ; free mode the brisk control τ (pan + zoom share one τ so
    // cursor-centered zoom stays exact mid-dolly — see camera-controls.ts). Under reduced motion
    // (PRD 15) a glide is a *user-caused* transition, so it still happens — but quickly (the brisk
    // CONTROL_TAU, ~120ms) instead of the 1.2s cinematic sweep, which would read as a large
    // autonomous-looking camera motion.
    const tau = gliding.current
      ? reducedRef.current
        ? CONTROL_TAU
        : RESET_TAU
      : CONTROL_TAU;
    currentPan.current.x = dampTo(currentPan.current.x, targetPan.current.x, delta, tau);
    currentPan.current.y = dampTo(currentPan.current.y, targetPan.current.y, delta, tau);
    currentZoom.current = dampTo(currentZoom.current, targetZoom.current, delta, tau);
    // Arrived at the glide target → leave glide mode (back to the brisk free-mode τ). Compares
    // against the live target (not a hardcoded origin), so it ends a fly-to glide as well as a
    // reset — identical to before at the origin.
    if (
      gliding.current &&
      Math.abs(currentPan.current.x - targetPan.current.x) < 1e-3 &&
      Math.abs(currentPan.current.y - targetPan.current.y) < 1e-3 &&
      Math.abs(currentZoom.current - targetZoom.current) < 1e-3
    ) {
      gliding.current = false;
    }

    // Idle-gated ambient drift, re-centered on the user's view. The factor eases
    // 1→0 while navigating and 0→1 after the idle delay, so the breathing
    // settles under the hand and resumes around wherever the camera was left —
    // never a snap. Amplitude scales with zoom so it stays proportional.
    //
    // Under reduced motion (PRD 15) the camera holds still: the idle breathing
    // is continuous, autonomous, unrequested motion, so we gate the drift offset
    // to zero. User pan/zoom (the eased base above) is unaffected — only the
    // ambient offset is removed, so the composition is preserved, just static.
    let driftX = 0;
    let driftY = 0;
    if (!reducedRef.current) {
      const msSince = performance.now() - lastInteractMs.current;
      idleFactor.current = nextIdleFactor(idleFactor.current, isDragging.current, msSince, delta);
      const k = idleFactor.current * (currentZoom.current / DEFAULT_ZOOM);
      const [dx, dy] = lissajous(ambientPhase(elapsed.current), 0.3, 0.15, 0);
      driftX = dx * k;
      driftY = dy * k;
    }

    camera.position.set(
      currentPan.current.x + driftX,
      currentPan.current.y + driftY,
      currentZoom.current,
    );
    // Look straight at the z=0 plane at the pan target → no rotation, ever; the
    // only orientation change is the pre-existing ambient micro-parallax sway.
    lookTarget.current.set(currentPan.current.x, currentPan.current.y, 0);
    camera.lookAt(lookTarget.current);
  });

  return null;
}
