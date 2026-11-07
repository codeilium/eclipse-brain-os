import { describe, expect, it } from "vitest";

import {
  createSamplerState,
  DOWNGRADE_FPS,
  DPR_CEILING,
  DPR_FLOOR,
  DPR_STEP,
  MAX_PLAUSIBLE_FRAME_MS,
  nextDprCeiling,
  recordFrame,
  shouldDowngrade,
  SUSTAINED_WINDOWS,
  WARMUP_MS,
  WINDOW_MS,
  windowFps,
  type SamplerState,
} from "./perf";

// --- helpers -------------------------------------------------------------

/** Feed 16ms frames until the warm-up is exhausted (no window leak — warm-up
 *  frames never accumulate into a window). Leaves `state` ready to judge. */
function warmUp(state: SamplerState): void {
  while (state.warmupRemainingMs > 0) recordFrame(state, 16);
}

/** An array of `count` identical deltas. */
function repeat(dt: number, count: number): number[] {
  return Array.from({ length: count }, () => dt);
}

/** Exactly one rolling window's worth of `dt`-ms frames (sums to ≥ WINDOW_MS). */
function windowOf(dt: number): number[] {
  return repeat(dt, Math.ceil(WINDOW_MS / dt));
}

/**
 * Simulate the `PerfGovernor` loop over a sequence of post-warm-up window
 * deltas: each frame → `recordFrame`; on a completed window → `shouldDowngrade`;
 * on a yes → apply `nextDprCeiling`. Returns the final ceiling and the list of
 * ceilings stepped through.
 */
function simulate(
  windowDeltas: number[],
  startCeiling: number,
): { ceiling: number; downgrades: number[] } {
  const s = createSamplerState();
  warmUp(s);
  let ceiling = startCeiling;
  const downgrades: number[] = [];
  for (const dt of windowDeltas) {
    const fps = recordFrame(s, dt);
    if (fps !== null && shouldDowngrade(s, fps, ceiling)) {
      ceiling = nextDprCeiling(ceiling);
      downgrades.push(ceiling);
    }
  }
  return { ceiling, downgrades };
}

// --- windowFps -----------------------------------------------------------

describe("windowFps", () => {
  it("computes frames per second from a frame count and elapsed ms", () => {
    expect(windowFps(60, 1000)).toBe(60);
    expect(windowFps(25, 1000)).toBe(25);
    expect(windowFps(30, 500)).toBe(60);
  });
  it("returns 0 for non-positive elapsed (no signal)", () => {
    expect(windowFps(5, 0)).toBe(0);
    expect(windowFps(5, -10)).toBe(0);
  });
});

// --- recordFrame (the sampler) -------------------------------------------

describe("recordFrame — outliers & invalid deltas", () => {
  it("ignores non-positive and implausibly large deltas without touching state", () => {
    const s = createSamplerState();
    expect(recordFrame(s, 5000)).toBeNull(); // tab-away / breakpoint pause
    expect(recordFrame(s, 0)).toBeNull();
    expect(recordFrame(s, -5)).toBeNull();
    expect(recordFrame(s, MAX_PLAUSIBLE_FRAME_MS + 0.001)).toBeNull();
    // None of those counted toward warm-up.
    expect(s.warmupRemainingMs).toBe(WARMUP_MS);
  });
  it("accepts a delta exactly at the plausibility ceiling", () => {
    const s = createSamplerState();
    recordFrame(s, MAX_PLAUSIBLE_FRAME_MS); // 100ms is a real (slow) frame
    expect(s.warmupRemainingMs).toBe(WARMUP_MS - MAX_PLAUSIBLE_FRAME_MS);
  });
});

describe("recordFrame — warm-up", () => {
  it("returns null while warming up, even with slow frames", () => {
    const s = createSamplerState();
    // Feed slow frames totalling less than the warm-up budget.
    const frames = Math.floor(WARMUP_MS / 40) - 1; // < WARMUP_MS worth
    for (let i = 0; i < frames; i++) {
      expect(recordFrame(s, 40)).toBeNull();
    }
    expect(s.warmupRemainingMs).toBeGreaterThan(0);
    expect(s.windowFrameCount).toBe(0); // nothing accumulated yet
  });
});

describe("recordFrame — windowing & smoothing", () => {
  it("returns null mid-window, then the smoothed fps when the window completes", () => {
    const s = createSamplerState();
    warmUp(s);
    // 40ms frames = 25fps; 25 frames span exactly WINDOW_MS.
    for (let i = 0; i < 24; i++) expect(recordFrame(s, 40)).toBeNull();
    expect(recordFrame(s, 40)).toBe(25); // 25th frame completes the window
    // Window reset for the next one.
    expect(s.windowAccumMs).toBe(0);
    expect(s.windowFrameCount).toBe(0);
  });
  it("smooths to the window average frame rate", () => {
    const slow = createSamplerState();
    warmUp(slow);
    let fps: number | null = null;
    for (const dt of windowOf(40)) fps = recordFrame(slow, dt) ?? fps;
    expect(fps).toBeCloseTo(25, 5);

    const fast = createSamplerState();
    warmUp(fast);
    fps = null;
    for (const dt of windowOf(16)) fps = recordFrame(fast, dt) ?? fps;
    expect(fps).toBeCloseTo(62.5, 1);
  });
  it("does not let an outlier mid-window poison the average", () => {
    const s = createSamplerState();
    warmUp(s);
    // 10 real frames of 40ms → 400ms / 10 frames so far.
    for (let i = 0; i < 10; i++) recordFrame(s, 40);
    expect(s.windowAccumMs).toBe(400);
    expect(s.windowFrameCount).toBe(10);
    // A 5s pause is dropped — window untouched.
    expect(recordFrame(s, 5000)).toBeNull();
    expect(s.windowAccumMs).toBe(400);
    expect(s.windowFrameCount).toBe(10);
    // Finish the window with real frames; fps reflects only real frames (25fps).
    let fps: number | null = null;
    for (let i = 0; i < 15; i++) fps = recordFrame(s, 40) ?? fps;
    expect(fps).toBe(25);
  });
});

// --- shouldDowngrade (the decision helper) -------------------------------

describe("shouldDowngrade", () => {
  it("does not downgrade before the sustained streak is reached", () => {
    const s = createSamplerState();
    for (let i = 0; i < SUSTAINED_WINDOWS - 1; i++) {
      expect(shouldDowngrade(s, 30, DPR_CEILING)).toBe(false);
    }
    expect(s.consecutiveSlowWindows).toBe(SUSTAINED_WINDOWS - 1);
  });
  it("downgrades once after SUSTAINED_WINDOWS consecutive slow windows, then resets", () => {
    const s = createSamplerState();
    for (let i = 0; i < SUSTAINED_WINDOWS - 1; i++) {
      expect(shouldDowngrade(s, 30, DPR_CEILING)).toBe(false);
    }
    expect(shouldDowngrade(s, 30, DPR_CEILING)).toBe(true);
    expect(s.consecutiveSlowWindows).toBe(0); // reset → next step needs a fresh streak
    expect(shouldDowngrade(s, 30, DPR_CEILING)).toBe(false);
  });
  it("treats a fast window as a streak reset (transient hitches never accumulate)", () => {
    const s = createSamplerState();
    let triggered = false;
    for (let i = 0; i < 20; i++) {
      // Repeating slow, slow, fast — never 3 consecutive slow windows.
      const fps = i % 3 === 2 ? 60 : 30;
      triggered = shouldDowngrade(s, fps, DPR_CEILING) || triggered;
    }
    expect(triggered).toBe(false);
  });
  it("treats exactly DOWNGRADE_FPS as fast (strict <)", () => {
    const s = createSamplerState();
    let triggered = false;
    for (let i = 0; i < 10; i++) {
      triggered = shouldDowngrade(s, DOWNGRADE_FPS, DPR_CEILING) || triggered;
    }
    expect(triggered).toBe(false);
    expect(s.consecutiveSlowWindows).toBe(0);
  });
  it("is a no-op at the floor even under sustained slowness", () => {
    const s = createSamplerState();
    for (let i = 0; i < SUSTAINED_WINDOWS + 5; i++) {
      expect(shouldDowngrade(s, 5, DPR_FLOOR)).toBe(false);
    }
    expect(s.consecutiveSlowWindows).toBe(0);
  });
});

// --- nextDprCeiling (the lever) ------------------------------------------

describe("nextDprCeiling", () => {
  it("steps the ceiling down by DPR_STEP", () => {
    expect(nextDprCeiling(DPR_CEILING)).toBeCloseTo(DPR_CEILING - DPR_STEP, 10);
    expect(nextDprCeiling(1.25)).toBeCloseTo(1.0, 10);
  });
  it("clamps at the floor and never goes below it", () => {
    expect(nextDprCeiling(DPR_FLOOR)).toBe(DPR_FLOOR);
    expect(nextDprCeiling(0.9)).toBe(DPR_FLOOR);
    for (let c = 0; c <= 2; c += 0.1) {
      expect(nextDprCeiling(c)).toBeGreaterThanOrEqual(DPR_FLOOR);
    }
  });
});

// --- end-to-end (the governor flow) --------------------------------------

describe("adaptive flow (sampler + decision + lever)", () => {
  it("steps 1.5 → 1.25 → 1.0 under sustained slowness, then stops at the floor", () => {
    // 100 slow windows (40ms frames) — far more than enough to floor it.
    const { ceiling, downgrades } = simulate(repeat(40, 25 * 100), DPR_CEILING);
    expect(downgrades).toEqual([1.25, 1.0]);
    expect(ceiling).toBe(DPR_FLOOR); // never below the floor
  });
  it("never downgrades a capable machine (sustained fast)", () => {
    const { ceiling, downgrades } = simulate(repeat(16, 63 * 30), DPR_CEILING);
    expect(downgrades).toEqual([]);
    expect(ceiling).toBe(DPR_CEILING); // stays at full quality
  });
  it("never downgrades on transient hitches (slow windows that don't sustain)", () => {
    const pattern: number[] = [];
    for (let i = 0; i < 6; i++) {
      pattern.push(...windowOf(40), ...windowOf(40), ...windowOf(16)); // slow, slow, fast
    }
    const { ceiling, downgrades } = simulate(pattern, DPR_CEILING);
    expect(downgrades).toEqual([]);
    expect(ceiling).toBe(DPR_CEILING);
  });
  it("a single tab-away outlier does not cause a downgrade", () => {
    const deltas = [...windowOf(16), 5000, ...windowOf(16), ...windowOf(16)];
    const { downgrades } = simulate(deltas, DPR_CEILING);
    expect(downgrades).toEqual([]);
  });
  it("does not judge during warm-up (slow startup is ignored)", () => {
    // No warmUp() here — slow frames from the very first frame.
    const s = createSamplerState();
    let ceiling = DPR_CEILING;
    const downgrades: number[] = [];
    // Feed slow frames totalling less than the warm-up budget → never judged.
    for (const dt of repeat(40, Math.floor(WARMUP_MS / 40) - 1)) {
      const fps = recordFrame(s, dt);
      if (fps !== null && shouldDowngrade(s, fps, ceiling)) {
        ceiling = nextDprCeiling(ceiling);
        downgrades.push(ceiling);
      }
    }
    expect(downgrades).toEqual([]);
    expect(ceiling).toBe(DPR_CEILING);
  });
});
