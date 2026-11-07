"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";

import {
  createSamplerState,
  nextDprCeiling,
  recordFrame,
  shouldDowngrade,
} from "./perf";

interface PerfGovernorProps {
  /**
   * The live DPR ceiling the `<Canvas>` is rendering at (owned as state by
   * `Observatory`). The governor never reads the *resolved* device DPR — it
   * reasons about the ceiling it can lower, and reports a lowered ceiling up.
   */
  readonly dprCeiling: number;
  /**
   * Reports a decided downgrade *up* to `Observatory`, which lowers its
   * `dprCeiling` state. The new ceiling is always strictly below the current one
   * (the governor guards this), so this fires at most a couple of times per
   * session — never per frame.
   */
  readonly onDowngrade: (nextCeiling: number) => void;
}

/**
 * The performance governor — the Observatory's adaptive-DPR safeguard (PRD 14).
 * A logic component (returns `null`, the §4 convention) that rides one `useFrame`
 * to sample real frame times and, **only on measured sustained slowness**, asks
 * `Observatory` to step the canvas DPR down toward the floor.
 *
 * This is the "measure the truth, don't guess from a label" floor: it responds
 * to whether *this* machine is actually suffering right now, not to an unreliable
 * GPU renderer string. Every session starts at full quality; the governor only
 * ever *reduces*, and only after a post-warm-up, sustained, sub-target window —
 * never a single hitch (see `perf.ts` for the pure, unit-tested math).
 *
 * **Allocation-free per frame** (the locked discipline — the safeguard must not
 * cost what it's trying to save): the sampler state is allocated once in a ref
 * and mutated in place; `recordFrame` returns a primitive; `shouldDowngrade` /
 * `nextDprCeiling` run only on a completed window; `onDowngrade` fires only on
 * the rare downgrade. It sits *alongside* the camera's `useFrame` (one more tiny
 * loop), deliberately not folded into it, so the perf concern and the camera
 * concern stay independent.
 *
 * Why DPR and only DPR (V1): on integrated graphics the dominant cost is
 * fragment work — shading pixels — so rendering at a lower device-pixel-ratio is
 * the cheapest, highest-impact, least-visible reduction. The other levers (fewer
 * motes, lower geometry detail, simpler materials, LOD) are documented-not-wired
 * and deferred (`performance-budget.md`). Down-only: no recovery/step-up in V1
 * (a reload re-measures from full quality); no persistence.
 */
export function PerfGovernor({ dprCeiling, onDowngrade }: PerfGovernorProps) {
  // Allocated once; mutated in place each frame (no per-frame allocation).
  const sampler = useRef(createSamplerState());

  // Mirror the current ceiling into a ref so the (stable) frame loop always
  // reads the latest value without re-subscribing when the ceiling changes.
  const ceilingRef = useRef(dprCeiling);
  useEffect(() => {
    ceilingRef.current = dprCeiling;
  }, [dprCeiling]);

  useFrame((_, delta) => {
    // delta is seconds (three's Clock.getDelta — unclamped); the sampler rejects
    // implausible values internally, so a tab-away pause never counts as a frame.
    const fps = recordFrame(sampler.current, delta * 1000);
    if (fps === null) return; // warming up, mid-window, or an outlier — nothing to judge
    if (shouldDowngrade(sampler.current, fps, ceilingRef.current)) {
      const next = nextDprCeiling(ceilingRef.current);
      if (next < ceilingRef.current) onDowngrade(next);
    }
  });

  return null;
}
