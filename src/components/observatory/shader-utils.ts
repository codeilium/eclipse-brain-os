/**
 * Shared GLSL snippets for the project's custom raw ShaderMaterials
 * (BackgroundGradient, StarGlowMaterial, DustMoteMaterial).
 *
 * These materials write `gl_FragColor` directly, so — unlike three's built-in
 * materials — three.js applies no output color-management or tone-mapping on
 * top. Each shader is therefore responsible for its own final-output pipeline:
 * **encode linear→sRGB, then dither.** Centralising the two snippets here keeps
 * that pipeline identical across all three shaders (and any future one).
 *
 * Interpolate them into a fragment shader's source, before `main()`:
 *
 *   fragmentShader: `
 *     uniform vec3 uColor;
 *     ${LINEAR_TO_SRGB_GLSL}
 *     ${DITHER_GLSL}
 *     void main() {
 *       gl_FragColor = vec4(dither(linearToSRGB(uColor)), 1.0);
 *     }
 *   `
 *
 * Convention: `.claude/docs/r3f-conventions.md` §5.1.
 */

/**
 * Linear → sRGB, mirroring three's own `sRGBTransferOETF`.
 *
 * R3F enables three's color management, so `new Color(hex)` decodes an sRGB
 * design token into *linear* space. A raw ShaderMaterial does not auto-encode
 * its output, so each shader must re-encode to sRGB itself before writing
 * `gl_FragColor` — otherwise the result renders far too dark (the PRD 4 lesson).
 */
export const LINEAR_TO_SRGB_GLSL = /* glsl */ `
  vec3 linearToSRGB(vec3 v) {
    return mix(
      pow(v, vec3(0.41666)) * 1.055 - vec3(0.055),
      v * 12.92,
      vec3(lessThanEqual(v, vec3(0.0031308)))
    );
  }
`;

/**
 * Screen-space dither — the last operation applied to a fragment's colour.
 *
 * Adds a tiny pseudo-random offset in [-0.5/255, +0.5/255) (one 8-bit
 * quantization step, peak-to-peak) derived from the pixel's screen coordinate.
 * This breaks up the hard concentric rings (Mach banding) that 8-bit
 * quantization produces in smooth low-brightness gradients: the noise dithers
 * which pixels round up vs. down at a band boundary, and the eye averages it
 * back into a continuous gradient.
 *
 * Must be applied AFTER `linearToSRGB` — banding lives in display (sRGB) space,
 * not linear space — and should be the final colour op before `gl_FragColor`.
 * Uses `gl_FragCoord.xy` (screen space, not UV) so the pattern stays static
 * like film grain rather than scrolling with the camera.
 *
 * Luminance-only by design: the *same* offset `n` is added to all three
 * channels. This is load-bearing for the honest-universe invariant
 * (`max(R−B) = 0` in the empty universe): identical per-channel offset +
 * monotonic 8-bit rounding preserves channel ordering, so a cool pixel
 * (B ≥ R) can never round into a warm one. Per-channel-random noise would
 * break this — do not use it here.
 */
export const DITHER_GLSL = /* glsl */ `
  vec3 dither(vec3 color) {
    float n = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
    return color + vec3(n);
  }
`;
