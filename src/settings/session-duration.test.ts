import { describe, expect, it } from "vitest";

import { POMODORO_DURATION_MS } from "@/universe";

import {
  clampSessionMinutes,
  DEFAULT_SESSION_DURATION_MS,
  MAX_SESSION_MINUTES,
  MIN_SESSION_MINUTES,
  minutesToMs,
  msToMinutes,
  parseSessionMinutes,
  resolveStoredDurationMs,
} from "./session-duration";

describe("DEFAULT_SESSION_DURATION_MS", () => {
  it("is the 25-minute Pomodoro constant (the first-run default/fallback)", () => {
    expect(DEFAULT_SESSION_DURATION_MS).toBe(POMODORO_DURATION_MS);
    expect(msToMinutes(DEFAULT_SESSION_DURATION_MS)).toBe(25);
  });
});

describe("minutesToMs / msToMinutes", () => {
  it("converts minutes to milliseconds", () => {
    expect(minutesToMs(25)).toBe(1_500_000);
    expect(minutesToMs(50)).toBe(3_000_000);
  });

  it("round-trips whole minutes", () => {
    for (const m of [1, 25, 50, 100, 600]) {
      expect(msToMinutes(minutesToMs(m))).toBe(m);
    }
  });

  it("rounds milliseconds to whole minutes", () => {
    expect(msToMinutes(89_000)).toBe(1); // 1.48 min → 1
    expect(msToMinutes(90_000)).toBe(2); // 1.5 min → 2 (round half up)
  });
});

describe("clampSessionMinutes", () => {
  it("passes a value already inside the band through", () => {
    expect(clampSessionMinutes(25)).toBe(25);
    expect(clampSessionMinutes(50)).toBe(50);
  });

  it("clamps up to MIN", () => {
    expect(clampSessionMinutes(0)).toBe(MIN_SESSION_MINUTES);
    expect(clampSessionMinutes(-10)).toBe(MIN_SESSION_MINUTES);
  });

  it("clamps down to MAX", () => {
    expect(clampSessionMinutes(9999)).toBe(MAX_SESSION_MINUTES);
  });

  it("keeps the boundaries", () => {
    expect(clampSessionMinutes(MIN_SESSION_MINUTES)).toBe(MIN_SESSION_MINUTES);
    expect(clampSessionMinutes(MAX_SESSION_MINUTES)).toBe(MAX_SESSION_MINUTES);
  });
});

describe("parseSessionMinutes", () => {
  it("parses a plain whole-minutes value", () => {
    expect(parseSessionMinutes("25")).toBe(25);
    expect(parseSessionMinutes("50")).toBe(50);
    expect(parseSessionMinutes("100")).toBe(100);
  });

  it("trims surrounding whitespace", () => {
    expect(parseSessionMinutes("  30  ")).toBe(30);
  });

  it("rounds fractional minutes to whole", () => {
    expect(parseSessionMinutes("25.9")).toBe(26);
    expect(parseSessionMinutes("25.4")).toBe(25);
  });

  it("clamps an over-large value to MAX (gentle, not rejected)", () => {
    expect(parseSessionMinutes("9999")).toBe(MAX_SESSION_MINUTES);
    expect(parseSessionMinutes("601")).toBe(MAX_SESSION_MINUTES);
  });

  it("clamps a tiny positive value up to MIN", () => {
    expect(parseSessionMinutes("0.4")).toBe(MIN_SESSION_MINUTES);
  });

  it("keeps the boundaries", () => {
    expect(parseSessionMinutes("1")).toBe(MIN_SESSION_MINUTES);
    expect(parseSessionMinutes("600")).toBe(MAX_SESSION_MINUTES);
  });

  // The gentle no-op cases — return null so the caller does nothing (no scold).
  it("returns null for empty / whitespace-only input", () => {
    expect(parseSessionMinutes("")).toBeNull();
    expect(parseSessionMinutes("   ")).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(parseSessionMinutes("abc")).toBeNull();
    expect(parseSessionMinutes("12abc")).toBeNull(); // Number() is strict
    expect(parseSessionMinutes("NaN")).toBeNull();
  });

  it("returns null for non-positive input", () => {
    expect(parseSessionMinutes("0")).toBeNull();
    expect(parseSessionMinutes("-5")).toBeNull();
  });
});

describe("resolveStoredDurationMs", () => {
  it("returns the default when nothing is stored", () => {
    expect(resolveStoredDurationMs(undefined)).toBe(DEFAULT_SESSION_DURATION_MS);
  });

  it("returns a valid stored ms value", () => {
    expect(resolveStoredDurationMs(String(minutesToMs(50)))).toBe(minutesToMs(50));
    expect(resolveStoredDurationMs("1500000")).toBe(1_500_000);
  });

  it("falls back to the default for junk / non-positive values", () => {
    expect(resolveStoredDurationMs("abc")).toBe(DEFAULT_SESSION_DURATION_MS);
    expect(resolveStoredDurationMs("0")).toBe(DEFAULT_SESSION_DURATION_MS);
    expect(resolveStoredDurationMs("-100")).toBe(DEFAULT_SESSION_DURATION_MS);
  });

  it("clamps an out-of-range stored value into the band", () => {
    expect(resolveStoredDurationMs("999999999")).toBe(
      minutesToMs(MAX_SESSION_MINUTES),
    );
  });
});
