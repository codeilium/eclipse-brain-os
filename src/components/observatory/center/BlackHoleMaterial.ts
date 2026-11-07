import { Color, DoubleSide, ShaderMaterial } from "three";

import { color } from "@/design/tokens";
import { DITHER_GLSL, LINEAR_TO_SRGB_GLSL } from "../shader-utils";

/**
 * The black hole's by-eye visual knobs (PRD 26), all in one place like
 * `StarGlowMaterial.ts`'s `HALO_FALLOFF_EXPONENT`. Codeilium nudges these live.
 *
 * Sizing is in the UNSCALED math frame (multiplied by `SYSTEM_VISUAL_SCALE` at
 * the render boundary, §9.1). For reference: a fresh star body is 0.21 unscaled,
 * a mature one ~1.05; the star corona caps at 2.5.
 */

/**
 * Radius of the dark core, unscaled — "on the order of a star body": a touch
 * larger than a fresh star (0.21), well under a mature one. The by-eye core
 * size knob.
 */
export const BLACKHOLE_CORE_RADIUS = 0.25;

/**
 * The accretion ring's maximum reach, unscaled — where the ring's outer edge
 * sits as presence approaches full. ~3.4× the core: present without competing
 * with a worked star's corona (max 2.5). The plane is sized to this, so it is
 * also the hard ceiling of the ring's extent. The by-eye extent knob.
 */
export const BLACKHOLE_MAX_RADIUS = 0.85;

/** Peak alpha of the accretion ring at full presence (the opacity ceiling). */
const RING_ALPHA_CEILING = 0.55;

/** Alpha of the dark core fill — high enough to silhouette against the haze. */
const CORE_ALPHA = 0.88;

/** Alpha of the faint structural rim (presence-independent; the quiet hint). */
const RIM_ALPHA = 0.16;

// Radial geometry, as fractions of the plane's half-extent (r = 1 at the
// inscribed circle = BLACKHOLE_MAX_RADIUS in world space).
const CORE_FRAC = BLACKHOLE_CORE_RADIUS / BLACKHOLE_MAX_RADIUS;
/** Half-width of the rim band hugging the core edge. */
const RIM_WIDTH_FRAC = 0.05;
/** Inner edge of the accretion ring — a dark gap past the rim (the horizon). */
const RING_INNER_FRAC = CORE_FRAC * 1.35;
/** The ring's outer edge at presence → 0 (its alpha is ~0 there anyway). */
const RING_OUT_MIN_FRAC = 0.5;

const f = (n: number): string => n.toFixed(4);

/**
 * Create the black hole's material — one plane, one draw call, three radial
 * zones composed in the fragment shader:
 *
 * - **The dark core**: a `void`-dark disc. Slightly darker than the background
 *   gradient's dusk-tinted center, so it reads as a silhouette — by rim and
 *   accretion, not fill.
 * - **The structural rim**: a faint cool `dusk` band at the core's edge,
 *   presence-independent — the center exists from the galaxy's creation (like
 *   the atmosphere), a quiet dark hint at zero work.
 * - **The accretion ring**: a streaked cool annulus (`dusk` → `amethyst`)
 *   whose alpha AND extent scale with `uIntensity` — the earned presence.
 *   The streaks (angular harmonics sheared by radius) make the ring read as
 *   matter in motion, so the slow mesh rotation is visible.
 *
 * COOL REGISTER ONLY — the strict inversion of warm-=-earned: the center
 * *gathers* work, so it earns presence (dusk/amethyst), never gold. Every
 * color here is cool (B ≥ R); channel-wise mixes of cool colors stay cool, the
 * sRGB encode is monotonic, and the dither is luminance-only — so the center
 * can never produce a warm pixel (`max(R−B) = 0` at ANY intensity),
 * structurally.
 *
 * `uIntensity` (0..1) is the eased displayed presence — mutate
 * `material.uniforms.uIntensity.value` in place, never replace the uniform
 * object (the same contract as `StarGlowMaterial`). The color uniforms are
 * set once from the tokens and never touched again.
 *
 * Output pipeline per §5.1: encode linear→sRGB, then dither (the last color op).
 */
export function createBlackHoleMaterial(intensity: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uIntensity: { value: intensity },
      uCore: { value: new Color(color.void) },
      uDusk: { value: new Color(color.dusk) },
      uAmethyst: { value: new Color(color.amethyst) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      uniform vec3 uCore;
      uniform vec3 uDusk;
      uniform vec3 uAmethyst;
      varying vec2 vUv;

      // Shared output helpers: linear→sRGB encode, then a screen-space
      // luminance-only dither (the last color op). See shader-utils.ts / §5.1.
      ${LINEAR_TO_SRGB_GLSL}
      ${DITHER_GLSL}

      void main() {
        // Centered coordinates: r = 1.0 at the plane's inscribed circle.
        vec2 p = (vUv - vec2(0.5)) * 2.0;
        float r = length(p);
        float theta = atan(p.y, p.x);

        // --- The dark core: a soft-edged void disc. ---
        float coreA = (1.0 - smoothstep(${f(CORE_FRAC * 0.85)}, ${f(CORE_FRAC)}, r)) * ${f(CORE_ALPHA)};

        // --- The structural rim: a faint cool band hugging the core edge.
        //     Presence-INDEPENDENT — the center precedes the stars. ---
        float rimA = (1.0 - smoothstep(0.0, ${f(RIM_WIDTH_FRAC)}, abs(r - ${f(CORE_FRAC)}))) * ${f(RIM_ALPHA)};

        // --- The accretion ring: earned presence. Its outer reach grows with
        //     intensity (extent is earned too); a dark gap separates it from
        //     the rim. Brightest at the inner edge, fading outward. ---
        float ringOut = mix(${f(RING_OUT_MIN_FRAC)}, 1.0, uIntensity);
        float radial = 1.0 - smoothstep(${f(RING_INNER_FRAC)}, ringOut, r);
        float innerFeather = smoothstep(${f(RING_INNER_FRAC)}, ${f(RING_INNER_FRAC + 0.06)}, r);
        // Streaks: angular harmonics sheared by radius (spiral lanes, not
        // spokes), so the disc reads as matter and its rotation is visible.
        float streak = clamp(
          0.5
            + 0.3 * sin(3.0 * theta + 5.0 * r)
            + 0.2 * sin(7.0 * theta - 11.0 * r + 1.7),
          0.0, 1.0);
        float ringA = innerFeather * radial * radial * streak
          * uIntensity * ${f(RING_ALPHA_CEILING)};
        // Hard zero past the inscribed circle (the plane's corners stay empty).
        ringA *= 1.0 - smoothstep(0.97, 1.0, r);

        // Ring color: dusk at the faint outer reach, toward amethyst at the
        // bright inner edge — both cool; their mix is cool.
        vec3 ringColor = mix(uDusk, uAmethyst, radial * 0.85);

        // Compose the three near-disjoint zones as a weighted average (straight
        // alpha out; the GPU blends over the background).
        float aSum = coreA + rimA + ringA;
        float alpha = clamp(aSum, 0.0, 1.0);
        vec3 zoneColor = aSum > 1e-4
          ? (uCore * coreA + uDusk * rimA + ringColor * ringA) / aSum
          : uCore;

        // Encode to sRGB, then dither — the final ops (§5.1).
        gl_FragColor = vec4(dither(linearToSRGB(zoneColor)), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
  });
}
