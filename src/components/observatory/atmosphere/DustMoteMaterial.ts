import { ShaderMaterial } from "three";

import { DITHER_GLSL, LINEAR_TO_SRGB_GLSL } from "../shader-utils";

/**
 * Create the dust-mote material — a soft, screen-space radial glow for the
 * instanced dust field. Each mote fades from a peak at its center (the surface
 * facing the camera) to zero at its silhouette, so it reads as soft light
 * caught in a medium rather than a crisp, flat-opacity disc.
 *
 * One material is shared by every mote instance (one InstancedMesh = one draw
 * call). Per-mote color rides a per-instance `aColor` attribute
 * (InstancedBufferAttribute) rather than a uniform, so the single shader works
 * for every instance with no per-particle uniforms.
 *
 * The falloff is derived from the sphere's own normals: `dot(viewNormal,
 * viewDir)` is 1 at the center (the normal points at the camera) and 0 at the
 * rim (the normal is perpendicular to the view), and `pow(.., 2.5)` softens it
 * into an atmospheric curve that reaches 0 with zero slope at the silhouette —
 * no hard edge. This is the sphere equivalent of StarGlowMaterial's plane
 * `distance(vUv, 0.5)` falloff.
 *
 * Includes the same linear→sRGB encoding as StarGlowMaterial / BackgroundGradient
 * (PRD 4): R3F enables three's color management, so colors arrive in linear space
 * and a raw ShaderMaterial must re-encode its own output to sRGB.
 *
 * `baseOpacity` is the peak alpha at a mote's center; the falloff scales it to 0
 * at the edges. To change it, mutate `material.uniforms.uOpacity.value` in place
 * — do NOT replace the uniform object.
 */
export function createDustMoteMaterial(baseOpacity: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uOpacity: { value: baseOpacity },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      varying vec3 vColor;
      varying vec3 vViewNormal;
      varying vec3 vViewDir;

      void main() {
        vColor = aColor;
        // Instanced transform (three.js injects instanceMatrix for an
        // InstancedMesh). Motes only translate + uniform-scale (no rotation),
        // so normalMatrix * normal is the correct view-space normal direction
        // (the uniform scale normalizes out in the fragment shader).
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vViewNormal = normalMatrix * normal;
        vViewDir = -mvPosition.xyz; // the camera sits at the origin in view space
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying vec3 vColor;
      varying vec3 vViewNormal;
      varying vec3 vViewDir;

      // Shared output helpers: linear→sRGB encode, then a screen-space dither
      // (the last color op). See shader-utils.ts / r3f-conventions.md §5.1.
      ${LINEAR_TO_SRGB_GLSL}
      ${DITHER_GLSL}

      void main() {
        // How strongly this fragment faces the camera: 1 at center, 0 at the rim.
        float facing = max(dot(normalize(vViewNormal), normalize(vViewDir)), 0.0);
        // Soften into an atmospheric curve that reaches 0 at the silhouette.
        float falloff = pow(facing, 2.5);
        float alpha = falloff * uOpacity;
        // Encode the (linear) per-mote color to sRGB for display, then dither.
        gl_FragColor = vec4(dither(linearToSRGB(vColor)), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
}
