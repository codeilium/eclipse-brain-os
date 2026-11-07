"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineLoop,
} from "three";

import { color } from "@/design/tokens";

import { SWELL_TIME_CONSTANT_S, easeDisplay } from "../display-ease";
import { useReducedMotion } from "../reduced-motion";

interface OrbitLineProps {
  /** Center of the orbit — the parent star's world-space position. */
  readonly center: readonly [number, number, number];
  /**
   * The planet's TARGET orbital radius (clearance shell, already scaled by
   * SYSTEM_VISUAL_SCALE). The ring EASES toward it (PRD 23) in lockstep with the
   * planet body, so the body always sits on its drawn path as the system breathes.
   */
  readonly radius: number;
}

/** Segment count for the traced circle — smooth enough at any on-screen size, cheap. */
const SEGMENTS = 96;

/**
 * A faint circular orbit path for one planet, centered on its parent star.
 *
 * Honest-universe note — orbit lines are a *path annotation*, a third category
 * beyond bodies and atmosphere (r3f-conventions.md §2.2). An orbit line exists
 * iff its planet exists and depicts that planet's real orbital radius. It is
 * NOT a body (no identity, nothing to count) and NOT atmosphere (it depends on
 * a specific planet). So it is kept faint + cool + subordinate — it reads as
 * "the path," not "a thing." The cool tone says *potential* (what could be
 * traveled); the lit planet on it is the *realized* state.
 *
 * CLEARANCE-AWARE + EASED (PRD 23). The radius is no longer fixed — it is the
 * planet's clearance shell, which grows as bodies grow. So the geometry is a
 * UNIT circle built ONCE (never rebuilt on a radius change) and the eased radius
 * is applied as a `scale` on the lineLoop each frame, via the SAME `easeDisplay`
 * + time constant + reduced-motion flag the planet body uses. Both the body and
 * this ring receive the same target `radius`, start from the same settled value,
 * and ease with identical math each frame, so they stay coincident — the planet
 * sits on its ring throughout the breathe ("follows automatically"). Snaps under
 * reduced motion (the snap is folded into `easeDisplay`).
 *
 * Cheap by construction: one BufferGeometry of ~96 points rendered as a
 * <lineLoop> with a built-in LineBasicMaterial (three handles its color
 * management). One scale write per frame, no per-frame allocation; geometry +
 * material disposed on unmount.
 *
 * Note: WebGL ignores LineBasicMaterial.linewidth on most platforms, so this is
 * a 1px line — which reads as an elegant, Kepler-like trace.
 */
export function OrbitLine({ center, radius }: OrbitLineProps) {
  // Reduced-motion signal (PRD 15), read once and gated per frame via the ref.
  const reducedRef = useReducedMotion();

  const lineRef = useRef<LineLoop>(null);

  // The displayed (eased) radius — initialized to the target so the ring rests
  // at the correct size on mount (no breathe on mount), then eases toward the
  // `radius` prop in lockstep with the planet body (PRD 23).
  const displayedRadius = useRef(radius);

  // Build the circle ONCE at unit radius (centered at the origin); the lineLoop's
  // `scale` applies the eased radius and its `position` places it at the parent
  // star. No rebuild on a radius change — the scale does the resizing.
  const geometry = useMemo(() => {
    const points: number[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const theta = (i / SEGMENTS) * Math.PI * 2;
      points.push(Math.cos(theta), Math.sin(theta), 0);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(points, 3));
    return g;
  }, []);

  const material = useMemo(
    () =>
      new LineBasicMaterial({
        color: new Color(color.amethyst), // cool — the path is "potential"
        transparent: true,
        opacity: 0.2, // faint and subordinate (path annotation, not a feature)
        depthWrite: false, // never occlude the bodies
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

  // Seed the ring scale from the displayed radius before the first paint, so the
  // ring renders at its target radius immediately (no one-frame unit-radius flash).
  useLayoutEffect(() => {
    lineRef.current?.scale.setScalar(displayedRadius.current);
  }, []);

  // Ease the ring radius toward the target each frame and apply it as a scale on
  // the unit circle (in place — no allocation). Lockstep with the planet body.
  useFrame((_, delta) => {
    const line = lineRef.current;
    if (!line) return;
    displayedRadius.current = easeDisplay(
      displayedRadius.current,
      radius,
      delta,
      SWELL_TIME_CONSTANT_S,
      reducedRef.current,
    );
    line.scale.setScalar(displayedRadius.current);
  });

  return (
    <lineLoop
      ref={lineRef}
      position={center as unknown as [number, number, number]}
      geometry={geometry}
      material={material}
      // Behind the planets + star body (renderOrder 0), in front of the star
      // halo (-10) and the background gradient (-1000): the path sits in the
      // mid-ground.
      renderOrder={-5}
    />
  );
}
