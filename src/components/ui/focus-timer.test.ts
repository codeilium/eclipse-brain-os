import { describe, expect, it } from "vitest";

import { POMODORO_DURATION_MS } from "@/universe";

import {
  formatDuration,
  isSessionComplete,
  sessionElapsedMs,
  sessionRemainingMs,
} from "./focus-timer";

const DURATION = POMODORO_DURATION_MS; // 1_500_000 ms = 25 min
const MIN = 60_000;

describe("sessionElapsedMs", () => {
  it("returns the wall-clock difference mid-session", () => {
    expect(sessionElapsedMs(1_000_000, 1_000_000 + 10 * MIN)).toBe(10 * MIN);
  });

  it("is 0 at the exact start", () => {
    expect(sessionElapsedMs(5_000, 5_000)).toBe(0);
  });

  it("clamps negative elapsed (now behind start — clock skew) to 0", () => {
    expect(sessionElapsedMs(5_000, 4_000)).toBe(0);
  });
});

describe("sessionRemainingMs", () => {
  it("returns the full duration for a just-started session", () => {
    const start = 1_000_000;
    expect(sessionRemainingMs(start, start, DURATION)).toBe(DURATION);
  });

  it("returns duration minus elapsed mid-session", () => {
    const start = 1_000_000;
    expect(sessionRemainingMs(start, start + 10 * MIN, DURATION)).toBe(
      DURATION - 10 * MIN,
    );
  });

  it("is exactly 0 the instant the duration elapses", () => {
    const start = 1_000_000;
    expect(sessionRemainingMs(start, start + DURATION, DURATION)).toBe(0);
  });

  it("floors at 0 when the session has overshot (returned-to late)", () => {
    const start = 1_000_000;
    expect(sessionRemainingMs(start, start + DURATION + 5 * MIN, DURATION)).toBe(
      0,
    );
  });
});

describe("isSessionComplete", () => {
  const start = 1_000_000;

  it("is false before the duration elapses", () => {
    expect(isSessionComplete(start, start + 24 * MIN, DURATION)).toBe(false);
  });

  it("is true exactly at the duration boundary", () => {
    expect(isSessionComplete(start, start + DURATION, DURATION)).toBe(true);
  });

  it("is true past the duration (overshoot / came back to a finished session)", () => {
    expect(isSessionComplete(start, start + DURATION + 60 * MIN, DURATION)).toBe(
      true,
    );
  });

  it("is false for negative elapsed (clock skew)", () => {
    expect(isSessionComplete(start, start - 1_000, DURATION)).toBe(false);
  });
});

describe("formatDuration", () => {
  it("renders a fresh Pomodoro as 25:00", () => {
    expect(formatDuration(POMODORO_DURATION_MS)).toBe("25:00");
  });

  it("renders zero as 00:00", () => {
    expect(formatDuration(0)).toBe("00:00");
  });

  it("zero-pads minutes and seconds (1:05)", () => {
    expect(formatDuration(65_000)).toBe("01:05");
  });

  it("floors partial seconds (1.9 s → 00:01)", () => {
    expect(formatDuration(1_900)).toBe("00:01");
  });

  it("renders one second short of full as 24:59", () => {
    expect(formatDuration(POMODORO_DURATION_MS - 1_000)).toBe("24:59");
  });

  it("clamps negative input to 00:00", () => {
    expect(formatDuration(-5_000)).toBe("00:00");
  });

  it("does not cap minutes at 59 (a longer span reads 90:00)", () => {
    expect(formatDuration(90 * MIN)).toBe("90:00");
  });
});

// PRD 21 — the session carries its own `durationMs`, so the countdown counts down
// from the chosen length, not a fixed 25. These prove the timer honors a custom
// duration (not secretly tied to POMODORO_DURATION_MS).
describe("custom (non-25) session length", () => {
  const start = 1_000_000;
  const FIFTY = 50 * MIN;

  it("counts the full custom duration down from the start", () => {
    expect(sessionRemainingMs(start, start, FIFTY)).toBe(FIFTY);
    expect(formatDuration(sessionRemainingMs(start, start, FIFTY))).toBe("50:00");
  });

  it("remaining mid-session reflects the custom duration", () => {
    expect(sessionRemainingMs(start, start + 10 * MIN, FIFTY)).toBe(40 * MIN);
  });

  it("is not complete at 25 min for a 50-min session (not tied to 25)", () => {
    expect(isSessionComplete(start, start + 25 * MIN, FIFTY)).toBe(false);
  });

  it("is complete exactly at the custom boundary", () => {
    expect(isSessionComplete(start, start + 49 * MIN, FIFTY)).toBe(false);
    expect(isSessionComplete(start, start + FIFTY, FIFTY)).toBe(true);
  });

  it("honors a short 1-minute session too (the MIN bound)", () => {
    const ONE = 1 * MIN;
    expect(formatDuration(sessionRemainingMs(start, start, ONE))).toBe("01:00");
    expect(isSessionComplete(start, start + ONE, ONE)).toBe(true);
  });
});
