import { afterEach, describe, expect, it } from "vitest";

import { closeDB, DB_NAME, getDB } from "./db";

describe("db connection", () => {
  afterEach(async () => {
    await closeDB();
  });

  it("opens the database", async () => {
    const db = await getDB();
    expect(db.name).toBe(DB_NAME);
  });

  it("returns the same cached connection on repeated calls", async () => {
    const a = await getDB();
    const b = await getDB();
    expect(a).toBe(b);
  });

  it("reopens a fresh connection after closeDB", async () => {
    const first = await getDB();
    await closeDB();
    const second = await getDB();
    expect(second).not.toBe(first);
    expect(second.name).toBe(DB_NAME);
  });

  it("closeDB is a no-op when no connection is open", async () => {
    await closeDB();
    await expect(closeDB()).resolves.toBeUndefined();
  });
});
