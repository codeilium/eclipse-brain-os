import { describe, expect, it } from "vitest";

import { isValidBodyName } from "./validation";

describe("isValidBodyName", () => {
  it("accepts a normal name", () => {
    expect(isValidBodyName("Mathematics")).toBe(true);
  });

  it("accepts a name surrounded by whitespace (trimmed content remains)", () => {
    expect(isValidBodyName("  Writing  ")).toBe(true);
  });

  it("accepts a single non-space character", () => {
    expect(isValidBodyName("x")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidBodyName("")).toBe(false);
  });

  it("rejects a whitespace-only string", () => {
    expect(isValidBodyName("   ")).toBe(false);
  });

  it("rejects tabs and newlines only", () => {
    expect(isValidBodyName("\t\n  \n")).toBe(false);
  });
});
