import { afterEach, describe, expect, it, vi } from "vitest";

import { createUniverse } from "@/universe";

import * as dbModule from "./db";
import { PersistenceError, QuotaExceededError } from "./errors";
import {
  clearUniverse,
  loadUniverse,
  resetConcurrencyTracker,
  saveUniverse,
} from "./repository";

/**
 * Error-path coverage. fake-indexeddb never enforces a quota or fails a write,
 * so we stub `getDB` with a fake whose operations reject — exercising the typed
 * error mapping that callers (and future UI) rely on.
 */
function fakeDb(overrides: Record<string, unknown>) {
  return {
    get: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Awaited<ReturnType<typeof dbModule.getDB>>;
}

describe("repository error mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetConcurrencyTracker();
  });

  it("maps a quota-named write failure to QuotaExceededError", async () => {
    resetConcurrencyTracker(); // observed = null → skip the concurrent-read check
    const quota = Object.assign(new Error("quota"), { name: "QuotaExceededError" });
    vi.spyOn(dbModule, "getDB").mockResolvedValue(fakeDb({ put: vi.fn().mockRejectedValue(quota) }));
    await expect(saveUniverse(createUniverse())).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("wraps a generic write failure in PersistenceError", async () => {
    resetConcurrencyTracker();
    vi.spyOn(dbModule, "getDB").mockResolvedValue(
      fakeDb({ put: vi.fn().mockRejectedValue(new Error("disk gone")) }),
    );
    await expect(saveUniverse(createUniverse())).rejects.toBeInstanceOf(PersistenceError);
  });

  it("wraps a load failure in PersistenceError", async () => {
    vi.spyOn(dbModule, "getDB").mockResolvedValue(
      fakeDb({ get: vi.fn().mockRejectedValue("boom") }),
    );
    await expect(loadUniverse()).rejects.toBeInstanceOf(PersistenceError);
  });

  it("wraps a clear failure in PersistenceError", async () => {
    vi.spyOn(dbModule, "getDB").mockResolvedValue(
      fakeDb({ delete: vi.fn().mockRejectedValue(new Error("nope")) }),
    );
    await expect(clearUniverse()).rejects.toBeInstanceOf(PersistenceError);
  });
});
