import { describe, expect, it } from "vitest";

import { isPlanetConsented, withPlanetConsent } from "./planet-mind-consent";

const A = "planet-a";
const B = "planet-b";

describe("isPlanetConsented — default OFF, only an explicit true is consent", () => {
  it("an unset store (undefined) is off for everyone", () => {
    expect(isPlanetConsented(undefined, A)).toBe(false);
  });

  it("an empty string is off", () => {
    expect(isPlanetConsented("", A)).toBe(false);
  });

  it("a planet absent from the map is off", () => {
    expect(isPlanetConsented(JSON.stringify({ [B]: true }), A)).toBe(false);
  });

  it("an explicit true for THIS planet is on", () => {
    expect(isPlanetConsented(JSON.stringify({ [A]: true }), A)).toBe(true);
  });

  it("a non-true entry (false / truthy-but-not-true) is off — never inferred", () => {
    expect(isPlanetConsented(JSON.stringify({ [A]: false }), A)).toBe(false);
    expect(isPlanetConsented(JSON.stringify({ [A]: 1 }), A)).toBe(false);
    expect(isPlanetConsented(JSON.stringify({ [A]: "true" }), A)).toBe(false);
  });

  it("malformed JSON is off (consent is NEVER inferred from junk)", () => {
    expect(isPlanetConsented("{not json", A)).toBe(false);
    expect(isPlanetConsented("null", A)).toBe(false);
    expect(isPlanetConsented("[]", A)).toBe(false);
    expect(isPlanetConsented('"a string"', A)).toBe(false);
    expect(isPlanetConsented("42", A)).toBe(false);
  });
});

describe("isPlanetConsented — per-planet isolation", () => {
  it("one planet's consent never speaks for another's", () => {
    const raw = JSON.stringify({ [A]: true });
    expect(isPlanetConsented(raw, A)).toBe(true);
    expect(isPlanetConsented(raw, B)).toBe(false);
  });
});

describe("withPlanetConsent — toggling, and the round-trip", () => {
  it("turning on sets the id to true (readable back as on)", () => {
    const raw = withPlanetConsent(undefined, A, true);
    expect(isPlanetConsented(raw, A)).toBe(true);
  });

  it("turning off REMOVES the id — nothing residual (revoking leaves no trace)", () => {
    const on = withPlanetConsent(undefined, A, true);
    const off = withPlanetConsent(on, A, false);
    expect(isPlanetConsented(off, A)).toBe(false);
    // The id is gone entirely, not set to false.
    expect(JSON.parse(off)).toEqual({});
  });

  it("toggling one planet never disturbs another", () => {
    let raw = withPlanetConsent(undefined, A, true);
    raw = withPlanetConsent(raw, B, true);
    raw = withPlanetConsent(raw, A, false); // revoke A only
    expect(isPlanetConsented(raw, A)).toBe(false);
    expect(isPlanetConsented(raw, B)).toBe(true);
  });

  it("is idempotent (re-setting on, re-clearing off round-trip cleanly)", () => {
    const on1 = withPlanetConsent(undefined, A, true);
    const on2 = withPlanetConsent(on1, A, true);
    expect(JSON.parse(on1)).toEqual(JSON.parse(on2));
    const off1 = withPlanetConsent(on2, A, false);
    const off2 = withPlanetConsent(off1, A, false);
    expect(JSON.parse(off1)).toEqual(JSON.parse(off2));
  });

  it("recovers from a malformed store by starting fresh (never throws)", () => {
    const raw = withPlanetConsent("{broken", A, true);
    expect(isPlanetConsented(raw, A)).toBe(true);
    expect(JSON.parse(raw)).toEqual({ [A]: true });
  });

  it("drops stray non-true values from the map on the next write", () => {
    const raw = withPlanetConsent(JSON.stringify({ [A]: false, [B]: true }), A, true);
    // B stays on (it was true); A becomes on; the stray false is gone.
    expect(JSON.parse(raw)).toEqual({ [A]: true, [B]: true });
  });
});
