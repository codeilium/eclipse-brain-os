import { describe, expect, it } from "vitest";

import * as persistence from "@/persistence";

describe("@/persistence barrel", () => {
  it("exposes the public persistence API", () => {
    expect(typeof persistence.saveUniverse).toBe("function");
    expect(typeof persistence.loadUniverse).toBe("function");
    expect(typeof persistence.clearUniverse).toBe("function");
    expect(typeof persistence.useUniverse).toBe("function");
  });

  it("re-exports the typed error hierarchy", () => {
    expect(typeof persistence.PersistenceError).toBe("function");
    expect(typeof persistence.CorruptDataError).toBe("function");
    expect(typeof persistence.QuotaExceededError).toBe("function");
    expect(typeof persistence.FutureSchemaError).toBe("function");
    expect(typeof persistence.MigrationError).toBe("function");
    expect(typeof persistence.ConcurrentModificationError).toBe("function");
  });

  it("every error subclass is catchable as PersistenceError and Error", () => {
    const errors = [
      new persistence.PersistenceError("base", new Error("inner")),
      new persistence.CorruptDataError("corrupt", "galaxies[0].id"),
      new persistence.QuotaExceededError("quota", new Error("dom")),
      new persistence.FutureSchemaError(2, 1),
      new persistence.MigrationError(1, 2, new Error("step")),
      new persistence.ConcurrentModificationError("t0", "t1"),
    ];
    for (const e of errors) {
      expect(e).toBeInstanceOf(persistence.PersistenceError);
      expect(e).toBeInstanceOf(Error);
    }
  });

  it("carries the diagnostic fields each error type promises", () => {
    expect(new persistence.PersistenceError("x", "why").cause).toBe("why");
    expect(new persistence.CorruptDataError("x", "a.b").field).toBe("a.b");
    expect(new persistence.FutureSchemaError(2, 1).storedVersion).toBe(2);
    expect(new persistence.FutureSchemaError(2, 1).currentVersion).toBe(1);
    expect(new persistence.MigrationError(1, 2).fromVersion).toBe(1);
    expect(new persistence.MigrationError(1, 2).toVersion).toBe(2);
    expect(new persistence.ConcurrentModificationError("t0", "t1").localLastModified).toBe("t0");
    expect(new persistence.ConcurrentModificationError("t0", "t1").remoteLastModified).toBe("t1");
    expect(new persistence.QuotaExceededError("x").name).toBe("QuotaExceededError");
  });
});
