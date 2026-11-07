"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  SphereGeometry,
} from "three";

import { color } from "@/design/tokens";

import { createDustMoteMaterial } from "./DustMoteMaterial";
import { WRAP_BOX_HEIGHT, WRAP_BOX_WIDTH, wrapToBox } from "./wrap";
import { ambientPhase, lissajous } from "../motion";
import { useReducedMotion } from "../reduced-motion";

// The by-eye dust density (PRD 31's one dial, Codeilium's verdict in PRD 32):
// 20 → 110 after drifting the real sky. The toroidal wrap-box math (./wrap) is
// unchanged — only the count moved, and density stays constant at any count.
const PARTICLE_COUNT = 110;

/** Peak alpha at a mote's center; the radial falloff scales it to 0 at the rim. */
const BASE_OPACITY = 0.22;

/**
 * Max per-mote blend from `haze` toward the cooler `amethyst`. Kept small so the
 * motes read as dust of slightly varying composition, never as a colorful field.
 */
const MAX_COLOR_BLEND = 0.18;

interface MoteData {
  readonly origin: [number, number, number];
  readonly drift: [number, number, number];
  /** Phase offset so motes are out of sync with each other. */
  readonly phase: number;
  /** Per-mote speed multiplier (0.5–1.5×) for parallax variety. */
  readonly speed: number;
  /** Base size in world units (small — these are dust). */
  readonly size: number;
}

/** Tiny deterministic PRNG (mulberry32). Pure — usable inside useMemo. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOTE_SEED = 0x9e3779b9;

/**
 * Sparse foreground dust motes — the texture of space. Each mote drifts on
 * the project's shared ambient clock (via `./motion`) at its own phase and
 * a per-mote 0.5×–1.5× speed multiplier; closer motes drift faster, giving
 * parallax depth.
 *
 * The field is toroidal (PRD 31 — the endless dust): motes are seeded once
 * into the fixed WRAP_BOX_WIDTH × WRAP_BOX_HEIGHT box, and each frame the
 * rendered position is the base (plus drift) wrapped modulo that box centered
 * on the camera's pan — a mote leaving one edge re-enters at the opposite
 * edge, so the dust never ends however far the camera pans, at constant count
 * and density. The box exceeds the worst-case visible extent at MAX_ZOOM plus
 * the drift margin (see `./wrap`), so a wrap can never happen on-screen. The
 * camera is READ (`state.camera.position` x/y), never written. The wrap is
 * *placement truth, not choreography*: it runs outside the reduced-motion
 * gate, always — a reduced-motion user who pans must still find dust there
 * (§6.4: truth is never gated). Only the *drift* is choreography, and only it
 * is gated.
 *
 * Each mote is rendered with a soft screen-space radial falloff (see
 * `./DustMoteMaterial`) — opaque-ish at the center, fading to zero at its
 * silhouette — so it reads as soft light caught in the medium rather than a
 * crisp, flat-opacity disc. Per-mote color varies subtly within the cool
 * palette (`haze` → slightly toward `amethyst`), so the field feels like dust
 * of varying composition rather than identical units.
 *
 * (See PRD 4 for the atmosphere-vs-bodies rationale — motes are atmosphere,
 * not bodies. Cool tokens only, never warm.)
 *
 * Performance: one InstancedMesh = one draw call regardless of count. The
 * scratch Object3D is allocated once and mutated in place; the per-mote color
 * is a static InstancedBufferAttribute set once at mount. The motion math comes
 * from `./motion`, so it allocates no objects per frame either.
 */
export function DustMotes() {
  const meshRef = useRef<InstancedMesh>(null);
  const elapsed = useRef(0);

  // Reduced-motion signal (PRD 15). Read once; the per-frame loop gates on the
  // ref's value — no per-frame media-query query (r3f-conventions.md §6.4).
  const reducedRef = useReducedMotion();
  // True once the motes have been laid out at their static (drift-free,
  // wrapped) positions under reduced motion, so we stop recomputing /
  // re-uploading the (unchanging) instance matrices every frame — a held
  // scene must also be a cheap one. Since PRD 31 the layout also depends on
  // the camera's pan (the wrap box is centered on it), so the early-return
  // additionally requires the camera not to have moved (lastCamX/lastCamY);
  // a reduced-motion *pan* re-lays the field out — placement is truth.
  const staticLaidOut = useRef(false);
  const lastCamX = useRef(Number.NaN); // NaN ≠ NaN → the first frame always lays out
  const lastCamY = useRef(Number.NaN);

  // Mote layout + per-mote color, generated once from one seeded PRNG pass.
  // Both endpoints (haze, amethyst) are cool (B-dominant), so every blended
  // mote stays cool — the atmosphere never introduces a warm pixel.
  const { motes, colors } = useMemo(() => {
    const result: MoteData[] = [];
    const colorArray = new Float32Array(PARTICLE_COUNT * 3);
    const rand = mulberry32(MOTE_SEED);
    const haze = new Color(color.haze);
    const amethyst = new Color(color.amethyst);
    const tmp = new Color();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Base positions tile the full wrap box uniformly (PRD 31) — the wrap
      // then slides whole periods of this pattern under the camera, so the
      // density is the same everywhere the camera can go. z is parallax, not
      // coverage: its scatter is untouched (and never wrapped).
      const x = (rand() - 0.5) * WRAP_BOX_WIDTH;
      const y = (rand() - 0.5) * WRAP_BOX_HEIGHT;
      const z = 1 + rand() * 3;
      result.push({
        origin: [x, y, z],
        drift: [
          0.15 + rand() * 0.15,
          0.1 + rand() * 0.1,
          0.05 + rand() * 0.05,
        ],
        phase: rand() * Math.PI * 2,
        speed: 0.5 + rand() * 1.0,
        size: 0.008 + rand() * 0.012,
      });
      // Subtle cool variation: blend haze toward amethyst by a small amount.
      // (R3F decodes the tokens into linear space; the shader re-encodes to
      // sRGB on output, so this lerp happens — and is stored — in linear space.)
      const blend = rand() * MAX_COLOR_BLEND;
      tmp.copy(haze).lerp(amethyst, blend);
      colorArray[i * 3] = tmp.r;
      colorArray[i * 3 + 1] = tmp.g;
      colorArray[i * 3 + 2] = tmp.b;
    }
    return { motes: result as readonly MoteData[], colors: colorArray };
  }, []);

  // Shared low-poly sphere; the per-instance color rides an InstancedBufferAttribute.
  const geometry = useMemo(() => {
    const geo = new SphereGeometry(1, 6, 6);
    geo.setAttribute("aColor", new InstancedBufferAttribute(colors, 3));
    return geo;
  }, [colors]);

  // One shared material for all instances (no per-particle uniforms): a soft
  // radial alpha falloff with the project's linear→sRGB encode.
  const material = useMemo(() => createDustMoteMaterial(BASE_OPACITY), []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const scratch = useRef(new Object3D());

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const mesh = meshRef.current;
    const obj = scratch.current;

    // The camera's pan — READ-ONLY (the camera looks straight at z=0 with no
    // rotation, so its x/y IS the view center). The wrap box below is centered
    // on it, so the mote field follows the camera wherever it pans (PRD 31).
    const camX = state.camera.position.x;
    const camY = state.camera.position.y;
    const reduced = reducedRef.current;

    // Reduced motion (PRD 15): the dust drift is continuous, autonomous,
    // unrequested motion — exactly what a vestibular-sensitive user asked to
    // be spared. Hold the motes drift-free; once laid out, return each frame
    // without recomputing or re-uploading the unchanged matrices — a held
    // scene must also be a cheap one. But the WRAP is placement, not motion:
    // if the camera panned (user-caused), the field must re-center on it, so
    // the early-return also requires an unmoved camera.
    if (
      reduced &&
      staticLaidOut.current &&
      camX === lastCamX.current &&
      camY === lastCamY.current
    ) {
      return;
    }

    // The drift clock only advances under motion — frozen while reduced,
    // exactly as before PRD 31 (the gate's behavior is unchanged).
    if (!reduced) elapsed.current += delta * 1000;

    for (let i = 0; i < motes.length; i++) {
      const mote = motes[i]!;
      let x = mote.origin[0];
      let y = mote.origin[1];
      let z = mote.origin[2];

      // Drift — choreography, GATED (PRD 15): skipped entirely under reduced
      // motion, so held motes rest at their drift-free base positions.
      if (!reduced) {
        // Per-mote phase: base ambient phase + per-mote constant offset
        const theta = ambientPhase(elapsed.current, mote.speed) + mote.phase;
        const [dx, dy, dz] = lissajous(
          theta,
          mote.drift[0],
          mote.drift[1],
          mote.drift[2],
        );
        x += dx;
        y += dy;
        z += dz;
      }

      // Wrap — placement truth, ALWAYS (PRD 31): the rendered position is the
      // base (plus any drift) wrapped modulo the box centered on the camera's
      // pan. The box exceeds the worst-case visible extent (see ./wrap), so a
      // mote only ever wraps while off-screen. z is parallax, never wrapped.
      obj.position.set(
        wrapToBox(x, camX, WRAP_BOX_WIDTH),
        wrapToBox(y, camY, WRAP_BOX_HEIGHT),
        z,
      );
      obj.scale.setScalar(mote.size);
      obj.updateMatrix();
      mesh.setMatrixAt(i, obj.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    staticLaidOut.current = reduced;
    lastCamX.current = camX;
    lastCamY.current = camY;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, PARTICLE_COUNT]}
      frustumCulled={false}
    />
  );
}
