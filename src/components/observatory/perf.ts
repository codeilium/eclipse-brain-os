/**
 * Pure FPS-sampling + quality-decision math for the Observatory's adaptive DPR
 * floor (PRD 14). This is the "measure the truth, don't guess from a label"
 * safeguard: rather than read an unreliable GPU renderer string, we sample the
 * one signal that actually matters to the user — is the frame rate *actually*
 * suffering, right now, on this machine? — and, only on demonstrated *sustained*
 * slowness, call for the cheapest, least-visible reduction (lower render DPR).
 *
 * **A minimal honest floor, not a tier engine.** V1's universe is small (dozens
 * of bodies). DPR is the one automatic lever wired here; the other levers (fewer
 * motes, lower geometry detail, simpler materials, LOD) are documented-not-wired
 * (see `performance-budget.md`) and deferred until a real body count / real
 * device report justifies them.
 *
 * Everything here is **pure** — no React, no three.js, no state of its own
 * (mirrors `camera-controls.ts` / `motion.ts`). The two stateful pieces operate
 * on a caller-owned `SamplerState` object, **mutated in place** and created
 * **once** (held in a `useRef` by the `PerfGovernor` driver), so the per-frame
 * path allocates nothing — the sampler must not cost per frame what it is trying
 * to save. Functions return primitives (`number | null`, `boolean`) only.
 *
 * The split mirrors the two acceptance pieces:
 *  - **the sampler** (`recordFrame`) turns a stream of frame deltas into a
 *    smoothed FPS once per rolling window, ignoring startup noise and outliers;
 *  - **the decision helper** (`shouldDowngrade`) maps a smoothed FPS + the
 *    current quality level into whether to step *down* (sustained-slow only,
 *    never below the floor, down-only).
 *  - **the lever** (`nextDprCeiling`) is what "down" means: one DPR step toward
 *    the floor.
 *
 * The driver (the `useFrame` wiring + the actual DPR application) is
 * `PerfGovernor.tsx`, verified by the perf-instrumentation check (§11), not unit
 * tests — exactly as every other `.tsx` driver in this project. These helpers
 * carry the testable math.
 */

// ---------------------------------------------------------------------------
// Tunables — named, eyeball-tunable craft constants (PRD 14 §8 / §9). The
// honest defaults below are starting points; the real-device feel is tuned by
// Codeilium on the Vega 8 target (headless SwiftShader cannot reproduce real-GPU
// frame rates). Nudge these against real behavior.
// ---------------------------------------------------------------------------

/** The frame-rate target the whole budget is written against (`performance-budget.md`). */
export const TARGET_FPS = 60;

/**
 * Smoothed FPS *below* which a completed window counts as "slow". Set with
 * margin under the 60fps target so a machine cruising at ~55 is left alone — we
 * step down only when genuinely struggling, never twitch near the target.
 * (Strict `<`: exactly 50fps is NOT slow.)
 */
export const DOWNGRADE_FPS = 50;

/**
 * How long (ms of real frames) to ignore after mount before the sampler is
 * willing to judge. The first moments — shader compile, asset warm-up,
 * Turbopack's first-frame stutter — are not representative; judging them would
 * degrade a perfectly capable machine over startup noise.
 */
export const WARMUP_MS = 2000;

/**
 * The rolling-window length (ms of real frames). FPS is judged as a *sustained*
 * average over ~1s, never an instantaneous spike, so a single GC pause or scroll
 * hitch can't trigger a downgrade.
 */
export const WINDOW_MS = 1000;

/**
 * How many *consecutive* slow windows constitute "sustained" slowness worth
 * acting on. At `WINDOW_MS = 1000` this is ~3s of continuous sub-target frame
 * rate before the first downgrade — conservative on purpose (never degrade what
 * isn't durably slow).
 */
export const SUSTAINED_WINDOWS = 3;

/**
 * Frame deltas larger than this (ms) are rejected outright — they are not
 * representative render frames but pauses (tab backgrounded, a breakpoint, a GC
 * mega-pause). R3F's `delta` is three's `Clock.getDelta()`, which is *not*
 * clamped, so after a tab-away the first delta can be seconds; counting it would
 * poison both the frame average and the window's elapsed time. 100ms = 10fps;
 * anything slower than that for a *single* frame is almost certainly a pause.
 */
export const MAX_PLAUSIBLE_FRAME_MS = 100;

/**
 * The starting (full-quality) DPR ceiling — the value the `<Canvas>` mounts at
 * every session. Matches the locked `performance-budget.md` clamp: the effective
 * DPR is `min(devicePixelRatio, DPR_CEILING)`, so on a standard display this is
 * 1.0 and on a HiDPI / fractional-scaled one up to 1.5. The sampler only ever
 * *reduces* from here.
 */
export const DPR_CEILING = 1.5;

/**
 * The lowest the adaptive lever will drop the DPR ceiling to. 1.0 is the honest
 * floor — below it text/bodies would visibly soften past the "invisible against
 * the smoothness it buys" trade. (Note: on a display whose `devicePixelRatio` is
 * already 1.0 the ceiling is already effectively at the floor, so the lever has
 * no headroom — it bites on HiDPI / scaled displays; see `performance-budget.md`.)
 */
export const DPR_FLOOR = 1.0;

/** One downgrade step. 1.5 → 1.25 → 1.0 — a gentle two-step descent, not a cliff. */
export const DPR_STEP = 0.25;

// ---------------------------------------------------------------------------
// Sampler state — a plain object the caller allocates ONCE and we mutate in
// place. No methods, no closures: keeping it a flat data bag is what lets the
// per-frame path stay allocation-free.
// ---------------------------------------------------------------------------

export interface SamplerState {
  /** Counts down from `WARMUP_MS`; while > 0 the sampler refuses to judge. */
  warmupRemainingMs: number;
  /** Accumulated real-frame time (ms) in the current rolling window. */
  windowAccumMs: number;
  /** Frames counted in the current rolling window. */
  windowFrameCount: number;
  /** Consecutive completed windows whose smoothed FPS was below `DOWNGRADE_FPS`. */
  consecutiveSlowWindows: number;
}

/** A fresh sampler state: full warm-up ahead, empty window, no slow streak. */
export function createSamplerState(): SamplerState {
  return {
    warmupRemainingMs: WARMUP_MS,
    windowAccumMs: 0,
    windowFrameCount: 0,
    consecutiveSlowWindows: 0,
  };
}

/**
 * Smoothed frames-per-second over a window of `frameCount` frames spanning
 * `accumMs` milliseconds. `accumMs <= 0` returns 0 (no frames → no signal),
 * though `recordFrame` only ever calls this once a window has real elapsed time.
 */
export function windowFps(frameCount: number, accumMs: number): number {
  if (accumMs <= 0) return 0;
  return frameCount / (accumMs / 1000);
}

/**
 * Feed one frame's delta (ms) into the sampler. Returns the **smoothed FPS** for
 * the window that just completed (post-warm-up), or **`null`** when there is
 * nothing to judge yet (still warming up, window not full, or the delta was an
 * outlier). Mutates `state` in place; allocates nothing.
 *
 * The flow:
 *  1. Reject non-positive or implausibly large deltas (pauses, not frames) — they
 *     never count toward warm-up, the window, or the average.
 *  2. Burn down the warm-up using real-frame time; judge nothing until it's over.
 *  3. Accumulate into the rolling window; once it spans `WINDOW_MS`, return its
 *     smoothed FPS and reset the window for the next one.
 */
export function recordFrame(state: SamplerState, deltaMs: number): number | null {
  // 1. Outlier / invalid → not a representative frame; ignore entirely.
  if (deltaMs <= 0 || deltaMs > MAX_PLAUSIBLE_FRAME_MS) return null;

  // 2. Warm-up: ignore the first WARMUP_MS of real frames.
  if (state.warmupRemainingMs > 0) {
    state.warmupRemainingMs -= deltaMs;
    return null;
  }

  // 3. Accumulate; only judge once a full window of real frames has elapsed.
  state.windowAccumMs += deltaMs;
  state.windowFrameCount += 1;
  if (state.windowAccumMs < WINDOW_MS) return null;

  const fps = windowFps(state.windowFrameCount, state.windowAccumMs);
  state.windowAccumMs = 0;
  state.windowFrameCount = 0;
  return fps;
}

/**
 * The decision helper: given a freshly-completed window's smoothed `fps`, the
 * `currentCeiling` (the live DPR ceiling), and the sampler `state` (for the
 * consecutive-slow streak), decide whether to step quality **down** this window.
 *
 * Rules (the "never degrade what isn't slow" discipline made explicit):
 *  - **At the floor → no-op.** If we're already at `DPR_FLOOR` there is nothing
 *    to give; reset the streak and return false. (There is no step-*up* — V1 is
 *    deliberately down-only; a reload re-measures from full quality.)
 *  - **Fast window → reset.** Any window at/above `DOWNGRADE_FPS` clears the
 *    streak, so a single fast second defeats a building downgrade (transient
 *    hitches never accumulate into one).
 *  - **Sustained slow → downgrade once.** Only after `SUSTAINED_WINDOWS`
 *    *consecutive* slow windows do we return true; the streak then resets, so the
 *    next step needs a fresh sustained period (natural hysteresis between steps —
 *    we never drop two steps off one bad patch).
 *
 * Pure (mutates only the passed `state`); returns a boolean.
 */
export function shouldDowngrade(
  state: SamplerState,
  fps: number,
  currentCeiling: number,
): boolean {
  // Already at the floor: nothing left to lower (down-only, no recovery).
  if (currentCeiling <= DPR_FLOOR) {
    state.consecutiveSlowWindows = 0;
    return false;
  }

  if (fps < DOWNGRADE_FPS) {
    state.consecutiveSlowWindows += 1;
  } else {
    state.consecutiveSlowWindows = 0;
    return false;
  }

  if (state.consecutiveSlowWindows >= SUSTAINED_WINDOWS) {
    state.consecutiveSlowWindows = 0;
    return true;
  }
  return false;
}

/**
 * The lever: the next DPR ceiling, one `DPR_STEP` below `current`, clamped at
 * `DPR_FLOOR`. At (or below) the floor it returns the floor unchanged — so the
 * caller's `next < current` guard makes a floored downgrade a clean no-op (no
 * spurious re-render). Pure.
 */
export function nextDprCeiling(current: number): number {
  return Math.max(DPR_FLOOR, current - DPR_STEP);
}
