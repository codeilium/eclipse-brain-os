/**
 * Eclipse Brain OS — Observatory module public API.
 *
 * The fullscreen R3F shell every visual PRD builds into. Import via
 * `@/components/observatory`. The Observatory receives the persisted
 * universe as a prop (one-way data flow from `page.tsx`).
 *
 * Conventions documented in `.claude/docs/r3f-conventions.md`.
 */

export { Observatory } from "./Observatory";

// PRD 24 — the composition root (`page.tsx`) fires the camera fly-to glide when a star is
// created: it resolves the new star's world position with `starPositionFromId` and passes a
// `CameraFlyTo` (nonce + target) into `Observatory`. Both are part of the observatory's public
// surface for that one wiring (star placement is a render-layer concern; the model has no
// position — r3f-conventions.md §8.1 / §9.1).
export { starPositionFromId } from "./stars/position";
export type { CameraFlyTo } from "./camera-controls";

// PRD 28 — the composition root passes the center panel its one honest derived
// line ("this center has gathered Xh of focus"): the SAME pure sum the
// accretion ring's light derives from. A read-only number; no new math.
export { galaxyFocusedMinutes } from "./center";
