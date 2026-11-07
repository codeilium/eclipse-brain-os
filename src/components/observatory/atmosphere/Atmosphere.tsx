"use client";

import { BackgroundGradient } from "./BackgroundGradient";
import { DustMotes } from "./DustMotes";

/**
 * The Atmosphere — the void's texture. Composes the radial background gradient
 * and the foreground dust motes. The gradient sits at the back of the scene; the
 * motes drift in the foreground. Together they give the void a sense of depth,
 * cosmic motion, and cool color — without adding any bodies.
 *
 * This is "the medium, not the contents." Bodies (stars, planets, moons) come
 * from `@/universe` data in later PRDs. Atmosphere is independent of data; it
 * exists for every state of the universe, including the empty one.
 */
export function Atmosphere() {
  return (
    <>
      <BackgroundGradient />
      <DustMotes />
    </>
  );
}
