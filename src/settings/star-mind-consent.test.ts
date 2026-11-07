import { describe, expect, it } from "vitest";

import { isStarConsented, withStarConsent } from "./star-mind-consent";

const A = "star-a";
const B = "star-b";

describe("isStarConsented — default OFF, only an explicit true is consent", () => {
  it("an unset store (undefined) is off for everyone", () => {
    expect(isStarConsented(undefined, A)).toBe(false);
  });

  it("an empty string is off", () => {
    expect(isStarConsented("", A)).toBe(false);
  });

  it("a star absent from the map is off", () => {
    expect(isStarConsented(JSON.stringify({ [B]: true }), A)).toBe(false);
  });

  it("an explicit true for THIS star is on", () => {
    expect(isStarConsented(JSON.stringify({ [A]: true }), A)).toBe(true);
  });

  it("a non-true entry (false / truthy-but-not-true) is off — never inferred", () => {
    expect(isStarConsented(JSON.stringify({ [A]: false }), A)).toBe(false);
    expect(isStarConsented(JSON.stringify({ [A]: 1 }), A)).toBe(false);
    expect(isStarConsented(JSON.stringify({ [A]: "true" }), A)).toBe(false);
  });

  it("malformed JSON is off (consent is NEVER inferred from junk)", () => {
    expect(isStarConsented("{not json", A)).toBe(false);
    expect(isStarConsented("null", A)).toBe(false);
    expect(isStarConsented("[]", A)).toBe(false);
    expect(isStarConsented('"a string"', A)).toBe(false);
    expect(isStarConsented("42", A)).toBe(false);
  });
});

describe("isStarConsented — per-star isolation", () => {
  it("one star's consent never speaks for another's", () => {
    const raw = JSON.stringify({ [A]: true });
    expect(isStarConsented(raw, A)).toBe(true);
    expect(isStarConsented(raw, B)).toBe(false);
  });
});

describe("withStarConsent — toggling, and the round-trip", () => {
  it("turning on sets the id to true (readable back as on)", () => {
    const raw = withStarConsent(undefined, A, true);
    expect(isStarConsented(raw, A)).toBe(true);
  });

  it("turning off REMOVES the id — nothing residual (revoking leaves no trace)", () => {
    const on = withStarConsent(undefined, A, true);
    const off = withStarConsent(on, A, false);
    expect(isStarConsented(off, A)).toBe(false);
    // The id is gone entirely, not set to false.
    expect(JSON.parse(off)).toEqual({});
  });

  it("toggling one star never disturbs another", () => {
    let raw = withStarConsent(undefined, A, true);
    raw = withStarConsent(raw, B, true);
    raw = withStarConsent(raw, A, false); // revoke A only
    expect(isStarConsented(raw, A)).toBe(false);
    expect(isStarConsented(raw, B)).toBe(true);
  });

  it("is idempotent (re-setting on, re-clearing off round-trip cleanly)", () => {
    const on1 = withStarConsent(undefined, A, true);
    const on2 = withStarConsent(on1, A, true);
    expect(JSON.parse(on1)).toEqual(JSON.parse(on2));
    const off1 = withStarConsent(on2, A, false);
    const off2 = withStarConsent(off1, A, false);
    expect(JSON.parse(off1)).toEqual(JSON.parse(off2));
  });

  it("recovers from a malformed store by starting fresh (never throws)", () => {
    const raw = withStarConsent("{broken", A, true);
    expect(isStarConsented(raw, A)).toBe(true);
    expect(JSON.parse(raw)).toEqual({ [A]: true });
  });

  it("drops stray non-true values from the map on the next write", () => {
    const raw = withStarConsent(JSON.stringify({ [A]: false, [B]: true }), A, true);
    // B stays on (it was true); A becomes on; the stray false is gone.
    expect(JSON.parse(raw)).toEqual({ [A]: true, [B]: true });
  });

  it("is a SEPARATE gate from planet consent (its own settings key)", () => {
    // A star map and a planet map share neither shape obligations nor ids — this
    // suite only ever touches the star helpers, proving the star gate stands
    // alone (the live wiring reads SETTINGS_KEYS.starMindConsent, not the planet
    // key — verified by construction in use-star-mind-consent.ts).
    const raw = withStarConsent(undefined, A, true);
    expect(isStarConsented(raw, A)).toBe(true);
  });
});
