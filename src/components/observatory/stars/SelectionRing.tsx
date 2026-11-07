"use client";

import { useEffect, useMemo } from "react";
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LineBasicMaterial,
} from "three";

import { color } from "@/design/tokens";

interface SelectionRingProps {
  /**
   * Ring radius in world units (already includes the gap past the star body).
   * Rendered at the local origin — this lives inside the star's position
   * `<group>`, so it is centered on the star body.
   */
  readonly radius: number;
}

/** Segment count for the traced circle — matches OrbitLine; smooth and cheap. */
const SEGMENTS = 96;

/**
 * The selection indicator: a quiet ring drawn around the *selected* star.
 *
 * This is neither a body, nor atmosphere, nor a path annotation — it is a
 * **selection / interaction affordance** (r3f-conventions.md §12.6): it
 * visualizes ephemeral UI selection state (passed *down* from `page.tsx`), not
 * persisted universe data. Constraints are load-bearing:
 *
 * - **Cool, never warm.** Warmth means *activity* (a tended pursuit). A warm
 *   selection ring would lie — it would make a neglected star look active just
 *   because you clicked it. So the ring is cool `haze` (the project's
 *   attention/UI neutral): selecting changes *your attention*, not the star's
 *   *state*. It also stays distinct from the amethyst orbit-path lines.
 * - **Subtle and subordinate.** Faint and thin (a 1px line, like OrbitLine), it
 *   marks the star without dominating the scene.
 * - **Honest.** It is a separate annotation *around* the star; it never touches
 *   the star's emissive body, so a dim ember stays a dim ember when selected
 *   (just with a legible cool ring around it).
 *
 * Built like OrbitLine: one BufferGeometry of ~96 points as a <lineLoop> with a
 * built-in LineBasicMaterial. depthTest off + a positive renderOrder so the ring
 * stays legible on top of the body it encircles. No per-frame work; geometry +
 * material disposed on unmount.
 */
export function SelectionRing({ radius }: SelectionRingProps) {
  // Build the circle once in local space (centered at the origin). Rebuild only
  // if the radius changes (e.g. the star body grew).
  const geometry = useMemo(() => {
    const points: number[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const theta = (i / SEGMENTS) * Math.PI * 2;
      points.push(Math.cos(theta) * radius, Math.sin(theta) * radius, 0);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(points, 3));
    return g;
  }, [radius]);

  const material = useMemo(
    () =>
      new LineBasicMaterial({
        color: new Color(color.haze), // cool — marks attention, never warmth
        transparent: true,
        opacity: 0.5, // present and legible, still subordinate
        depthWrite: false,
        depthTest: false, // always legible on top of the body it encircles
      }),
    [],
  );

  // Dispose imperatively-created GPU resources on unmount.
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return (
    <lineLoop
      geometry={geometry}
      material={material}
      // Draw on top so the selection stays legible (paired with depthTest:false).
      renderOrder={5}
    />
  );
}
