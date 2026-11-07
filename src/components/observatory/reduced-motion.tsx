"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";

/**
 * The canvas-side reduced-motion signal (PRD 15).
 *
 * The resolved "reduce motion?" boolean is computed once in `page.tsx`
 * (`useMotionPreference`) and threaded into the canvas as a single prop
 * (`Observatory → Scene`). `Scene` wraps the scene in this provider so every
 * `useFrame` loop inside the canvas (camera, dust motes, planets, moons) can
 * read it **without per-frame querying and without per-body prop drilling**.
 *
 * The context value is a **stable ref**, deliberately: the loops read
 * `ref.current` inside `useFrame`, so a preference change updates the ref (via
 * the effect below) and is picked up on the next frame — with **no re-render of
 * the bodies and no per-frame allocation** (the read-once-then-gate discipline,
 * matching how `Camera` mirrors `locked` and `PerfGovernor` mirrors `dprCeiling`
 * into refs). See `r3f-conventions.md` §6.4.
 *
 * Context works freely *within* the Canvas subtree (the R3F reconciler boundary
 * only isolates context crossing *into* the canvas from the outer DOM tree —
 * which is why the value still arrives as a prop first).
 */
const ReducedMotionContext = createContext<RefObject<boolean> | null>(null);

/** Stable fallback for a consumer mounted without a provider — never reduce. */
const NOT_REDUCED: RefObject<boolean> = { current: false };

export function ReducedMotionProvider({
  reduced,
  children,
}: {
  readonly reduced: boolean;
  readonly children: ReactNode;
}) {
  // Initialized to the resolved value (the provider only mounts once the
  // preference has loaded, so this is correct from the first frame) and kept in
  // sync on change. The ref object identity is stable, so consumers never
  // re-render — they simply read the fresh value next frame.
  const ref = useRef(reduced);
  useEffect(() => {
    ref.current = reduced;
  }, [reduced]);

  return (
    <ReducedMotionContext.Provider value={ref}>
      {children}
    </ReducedMotionContext.Provider>
  );
}

/**
 * Read the reduced-motion ref. Returns a stable `RefObject<boolean>`; read
 * `.current` inside `useFrame` (never call this per frame — call it once at the
 * top of the component, like any hook). Defensively returns a non-reducing
 * fallback when used outside a provider.
 */
export function useReducedMotion(): RefObject<boolean> {
  return useContext(ReducedMotionContext) ?? NOT_REDUCED;
}
