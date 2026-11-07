import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as dbModule from "./db";
import { getDB, PAGES_STORE } from "./db";
import { PersistenceError } from "./errors";
import { deletePage, deletePages, loadPage, savePage } from "./pages";

describe("pages", () => {
  beforeEach(async () => {
    // Isolate each test — the pages store is shared across this file's run.
    const db = await getDB();
    await db.clear(PAGES_STORE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("round-trips a saved page", async () => {
    const saved = await savePage("body-1", "# Notes\n\nhello");
    expect(saved).toMatchObject({ id: "body-1", markdown: "# Notes\n\nhello" });
    expect(typeof saved?.updatedAt).toBe("number");
    expect(await loadPage("body-1")).toEqual(saved);
  });

  it("loadPage returns null for a body with no page (the lazy default)", async () => {
    expect(await loadPage("never-written")).toBeNull();
  });

  it("is lazy — no record exists until the first non-empty save", async () => {
    expect(await loadPage("body-2")).toBeNull();
    await savePage("body-2", "first real content");
    expect(await loadPage("body-2")).not.toBeNull();
  });

  it("updates (overwrites) an existing page on re-save", async () => {
    await savePage("body-3", "v1");
    const v2 = await savePage("body-3", "v2");
    expect(v2?.markdown).toBe("v2");
    expect((await loadPage("body-3"))?.markdown).toBe("v2");
  });

  it("preserves markdown verbatim (only the emptiness check trims)", async () => {
    const md = "  surrounding spaces inside real content are kept  ";
    expect((await savePage("body-4", md))?.markdown).toBe(md);
  });

  it("saving empty markdown deletes the record and returns null", async () => {
    await savePage("body-5", "real");
    expect(await loadPage("body-5")).not.toBeNull();
    expect(await savePage("body-5", "")).toBeNull();
    expect(await loadPage("body-5")).toBeNull();
  });

  it("treats whitespace-only markdown as empty (deletes the record)", async () => {
    await savePage("body-6", "real");
    expect(await savePage("body-6", "   \n\t  ")).toBeNull();
    expect(await loadPage("body-6")).toBeNull();
  });

  it("an empty save when no record exists is a harmless no-op", async () => {
    expect(await savePage("body-7", "")).toBeNull();
    expect(await loadPage("body-7")).toBeNull();
  });

  it("deletePage removes a page", async () => {
    await savePage("body-8", "content");
    await deletePage("body-8");
    expect(await loadPage("body-8")).toBeNull();
  });

  it("deletePage on a missing record is a harmless no-op", async () => {
    await expect(deletePage("ghost")).resolves.toBeUndefined();
  });

  it("deletePages removes a set of pages, leaving the others intact", async () => {
    await savePage("a", "A");
    await savePage("b", "B");
    await savePage("c", "C");
    await deletePages(["a", "c"]);
    expect(await loadPage("a")).toBeNull();
    expect(await loadPage("b")).not.toBeNull();
    expect(await loadPage("c")).toBeNull();
  });

  it("deletePages tolerates non-existent ids (best-effort cleanup)", async () => {
    await savePage("keep", "K");
    await expect(
      deletePages(["missing-1", "missing-2"]),
    ).resolves.toBeUndefined();
    expect(await loadPage("keep")).not.toBeNull();
  });

  it("deletePages on an empty set is a no-op", async () => {
    await expect(deletePages([])).resolves.toBeUndefined();
  });

  // --- Error mapping. fake-indexeddb never fails a write, so stub getDB to
  // reject and exercise the typed-error branches the hook relies on. ---

  it("wraps a load failure in PersistenceError", async () => {
    vi.spyOn(dbModule, "getDB").mockRejectedValue(new Error("disk gone"));
    await expect(loadPage("x")).rejects.toBeInstanceOf(PersistenceError);
  });

  it("wraps a save failure in PersistenceError", async () => {
    vi.spyOn(dbModule, "getDB").mockRejectedValue(new Error("disk gone"));
    await expect(savePage("x", "non-empty")).rejects.toBeInstanceOf(
      PersistenceError,
    );
  });

  it("wraps a delete failure in PersistenceError", async () => {
    vi.spyOn(dbModule, "getDB").mockRejectedValue(new Error("disk gone"));
    await expect(deletePage("x")).rejects.toBeInstanceOf(PersistenceError);
  });

  it("deletePages swallows failures (best-effort — never throws)", async () => {
    vi.spyOn(dbModule, "getDB").mockRejectedValue(new Error("disk gone"));
    await expect(deletePages(["x", "y"])).resolves.toBeUndefined();
  });
});
