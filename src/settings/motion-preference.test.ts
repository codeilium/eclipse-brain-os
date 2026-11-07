import { describe, expect, it } from "vitest";

import {
  DEFAULT_MOTION_PREFERENCE,
  isMotionPreference,
  resolveReducedMotion,
} from "./motion-preference";

describe("resolveReducedMotion", () => {
  // The full 3 preferences × 2 OS states truth table — the whole point of
  // extracting this as pure logic is that every combination is verified.
  it("forces reduced when preference is 'reduce', regardless of the OS", () => {
    expect(resolveReducedMotion(false, "reduce")).toBe(true);
    expect(resolveReducedMotion(true, "reduce")).toBe(true);
  });

  it("forces full motion when preference is 'allow', regardless of the OS", () => {
    expect(resolveReducedMotion(false, "allow")).toBe(false);
    expect(resolveReducedMotion(true, "allow")).toBe(false);
  });

  it("follows the OS when preference is 'system'", () => {
    expect(resolveReducedMotion(false, "system")).toBe(false);
    expect(resolveReducedMotion(true, "system")).toBe(true);
  });
});

describe("DEFAULT_MOTION_PREFERENCE", () => {
  it("defers to the operating system out of the box", () => {
    expect(DEFAULT_MOTION_PREFERENCE).toBe("system");
    // The default must mean "whatever the OS says" — i.e. resolve === osReduced.
    expect(resolveReducedMotion(true, DEFAULT_MOTION_PREFERENCE)).toBe(true);
    expect(resolveReducedMotion(false, DEFAULT_MOTION_PREFERENCE)).toBe(false);
  });
});

describe("isMotionPreference", () => {
  it("accepts the three valid preferences", () => {
    expect(isMotionPreference("system")).toBe(true);
    expect(isMotionPreference("reduce")).toBe(true);
    expect(isMotionPreference("allow")).toBe(true);
  });

  it("rejects anything else (undefined, stale values, wrong types)", () => {
    expect(isMotionPreference(undefined)).toBe(false);
    expect(isMotionPreference(null)).toBe(false);
    expect(isMotionPreference("")).toBe(false);
    expect(isMotionPreference("Reduce")).toBe(false); // case-sensitive
    expect(isMotionPreference("full")).toBe(false); // a plausible-but-wrong value
    expect(isMotionPreference(true)).toBe(false);
    expect(isMotionPreference(0)).toBe(false);
  });
});
