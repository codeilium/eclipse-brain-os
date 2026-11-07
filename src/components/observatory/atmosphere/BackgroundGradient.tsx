"use client";

import { useEffect, useMemo } from "react";
import { Color, DoubleSide, ShaderMaterial } from "three";

import { color } from "@/design/tokens";
import { DITHER_GLSL, LINEAR_TO_SRGB_GLSL } from "../shader-utils";

/**
 * A subtle radial gradient that gives the void depth — slightly lighter at the
 * center (toward the user's natural focal point) and darker at the edges. Sits
 * behind everything in the scene. The colors stay deep — only a hint of dusk
 * purple at center, fading into pure void at the edges — so it reads as
 * atmosphere, not as a feature.
 *
 * Implementation: a single large background plane with a fragment shader that
 * computes the radial gradient on the GPU. One draw call, fully static (no
 * uniforms updated per frame).
 *
 * Honest-universe note: removing this gradient just makes the void flat. It
 * doesn't suggest the user lost anything. Atmosphere, not bodies.
 */
export function BackgroundGradient() {
  // Allocate the material once. The Colors are converted from hex tokens to
  // three.Color objects at mount, never per-frame. R3F enables three's color
  // management, so `new Color(hex)` decodes the sRGB token into *linear* space;
  // the fragment shader therefore mixes in linear and re-encodes to sRGB on
  // output (a raw ShaderMaterial, unlike built-in materials, does not do this
  // automatically — without it the gradient renders far too dark and inverted).
  const material = useMemo(() => {
    const innerColor = new Color(color.dusk); // #2a2342 — the cool purple haze hint
    const outerColor = new Color(color.void); // #04050a — pure darkness

    return new ShaderMaterial({
      uniforms: {
        uInner: { value: innerColor },
        uOuter: { value: outerColor },
        uIntensity: { value: 0.15 }, // how strong the gradient reads (0 = invisible, 1 = obvious)
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uInner;
        uniform vec3 uOuter;
        uniform float uIntensity;
        varying vec2 vUv;

        // Shared output helpers: linear→sRGB encode (so the plane's void edges
        // match the managed canvas clear color), then a screen-space dither —
        // the last color op — to eliminate 8-bit banding. See shader-utils.ts /
        // r3f-conventions.md §5.1.
        ${LINEAR_TO_SRGB_GLSL}
        ${DITHER_GLSL}

        void main() {
          // Distance from center of the plane, in [0, ~0.7] (corner is sqrt(2)/2 away)
          float d = distance(vUv, vec2(0.5));
          // Soft falloff — gradient peaks at center, fades to outer by ~0.7 radius
          float t = smoothstep(0.0, 0.7, d);
          // Mix from inner (center) to outer (edges); intensity controls overall strength
          vec3 mixed = mix(uInner, uOuter, t);
          // Pull toward outer so the gradient is *additive subtlety*, not a dominant feature
          vec3 final = mix(uOuter, mixed, uIntensity);
          // Encode to sRGB for display (colors above are linear), then dither
          // the result so the radial fade reads as continuous, not banded.
          gl_FragColor = vec4(dither(linearToSRGB(final)), 1.0);
        }
      `,
      side: DoubleSide,
      depthWrite: false, // Don't occlude future bodies
      depthTest: false, // Always render at the very back
    });
  }, []);

  // Free the imperatively-created material when the Atmosphere unmounts (e.g. if
  // the canvas is torn down). The plane geometry below is JSX, so R3F disposes
  // it automatically; this ShaderMaterial is ours to release.
  // (performance-budget.md: "Dispose geometries, materials, and textures on unmount.")
  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh
      position={[0, 0, -50]} // Far back, behind everything else
      material={material}
      // The plane fills the camera's view at this distance with comfortable margin
      // for the ambient camera drift (which is small)
      renderOrder={-1000} // Render first, before everything else
    >
      <planeGeometry args={[100, 100]} />
    </mesh>
  );
}
