import { Color, DoubleSide, ShaderMaterial } from "three";

import { DITHER_GLSL, LINEAR_TO_SRGB_GLSL } from "../shader-utils";

/**
 * The halo's radial-falloff exponent — the single by-eye legibility knob for the
 * star glow (the halo-legibility polish). The alpha is `pow(falloff, exponent) ×
 * uIntensity`, so this shapes how the glow's strength is *distributed* from center
 * to rim. It is the only thing that governs "how faint does this halo read":
 *
 * - LOWER → luminous energy reaches further out *past the body*, so the glow is
 *   more present and its growth (the corona-driven plane scale) is more legible.
 *   The original 2.5 concentrated the bright part within the body's own radius, so
 *   only a thin fast-fading collar escaped — too transparent to read in a dark
 *   room. Below ~1.5 the soft edge starts to harden into a disc.
 * - HIGHER → tighter / subtler.
 *
 * It only *redistributes* alpha: it never lifts the peak (center alpha stays
 * `= uIntensity`, so a worked star can't blow out and its top-end growth headroom
 * is preserved) and it cannot lift the floor — when `uIntensity = 0` (a planet-less
 * star: brightness 0, corona at base), `alpha = falloff^exponent × 0 = 0` for ANY
 * exponent. And warmth is governed entirely by brightness (the halo color), which
 * this does not touch — so a neglected star's glow stays *cool* (quiet) and only an
 * *active* star's *warm* glow is made more present. The honest-dim end is therefore
 * untouched at any value. By-eye-tunable like SWELL_TIME_CONSTANT_S / DISK_RADIUS /
 * SYSTEM_VISUAL_SCALE (r3f-conventions.md §7). Interpolated as a GLSL float literal.
 */
const HALO_FALLOFF_EXPONENT = 1.8; // was 2.5 (too faint to read)

/**
 * Create a star's halo material — a soft radial glow with alpha falloff,
 * intended for a flat plane facing the camera. Becomes a "haze" around the
 * star body.
 *
 * Color: the same color computed for the star body (passed in).
 * Intensity: scales 0..1, modulates how strongly the halo reads.
 *
 * Important: this material allocates uniforms once. To update the color
 * or intensity, mutate `material.uniforms.uColor.value` / `uIntensity.value`
 * in place. Do NOT replace the uniform objects.
 *
 * Includes the same linear→sRGB encoding learned in PRD 4 (BackgroundGradient):
 * R3F enables three's color management, so `new Color(hex)` decodes into linear
 * space; a raw ShaderMaterial does not auto-encode the output to sRGB, so we
 * do it manually in the fragment shader.
 */
export function createStarGlowMaterial(
  starColor: Color,
  intensity: number,
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: starColor.clone() },
      uIntensity: { value: intensity },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec2 vUv;

      // Shared output helpers: linear→sRGB encode, then a screen-space dither
      // (the last color op). See shader-utils.ts / r3f-conventions.md §5.1.
      ${LINEAR_TO_SRGB_GLSL}
      ${DITHER_GLSL}

      void main() {
        // Distance from center of the plane (UV in [0, 1])
        float d = distance(vUv, vec2(0.5));
        // Smooth falloff that reaches 0 at d = 0.5 (the plane's edge)
        float falloff = 1.0 - smoothstep(0.0, 0.5, d);
        // Exponentiate the falloff for a softer, more atmospheric curve. The
        // exponent (HALO_FALLOFF_EXPONENT) is the legibility knob: lower pushes the
        // glow further past the body so it reads (and its growth shows); see above.
        falloff = pow(falloff, ${HALO_FALLOFF_EXPONENT.toFixed(2)});
        // Apply intensity
        float alpha = falloff * uIntensity;
        // Encode color to sRGB, then dither so the halo's soft falloff doesn't band.
        vec3 finalColor = linearToSRGB(uColor);
        gl_FragColor = vec4(dither(finalColor), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
  });
}
