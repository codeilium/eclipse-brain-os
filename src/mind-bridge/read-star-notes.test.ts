import { describe, expect, it, vi } from "vitest";

import {
  assembleStarNotes,
  readConsentedStarNotes,
  STAR_MIND_NOTES_CAP,
  type StarSubtreeBody,
} from "./read-star-notes";

const STAR = "star-1";
const P1 = "planet-1";
const P2 = "planet-2";

const SUBTREE: StarSubtreeBody[] = [
  { bodyId: STAR, bodyName: "Learning Piano", kind: "star" },
  { bodyId: P1, bodyName: "Scales", kind: "planet" },
  { bodyId: P2, bodyName: "Sight-reading", kind: "planet" },
];

/** A recording subtree resolver — proves WHETHER and WITH WHAT it is called. */
function recordingResolve(subtree: StarSubtreeBody[] = SUBTREE) {
  return vi.fn(() => subtree);
}

/** A recording page-loader keyed by id (returns `{ markdown, updatedAt }`). */
function recordingLoadPage(
  pages: Record<string, { markdown: string; updatedAt: number } | null>,
) {
  return vi.fn(async (id: string) => pages[id] ?? null);
}

describe("readConsentedStarNotes — star consent is the gate (off → nothing resolved/read)", () => {
  it("consent OFF → returns empty, and NEVER resolves the subtree or reads a page", async () => {
    const resolveSubtree = recordingResolve();
    const loadPageFn = recordingLoadPage({ [STAR]: { markdown: "x", updatedAt: 1 } });
    const out = await readConsentedStarNotes(STAR, {
      isStarConsentedFn: async () => false,
      resolveSubtree,
      loadPageFn,
    });
    expect(out).toEqual({ notes: [], truncated: false });
    expect(resolveSubtree).not.toHaveBeenCalled(); // off → no resolve
    expect(loadPageFn).not.toHaveBeenCalled(); // off → no read, no call, nothing sent
  });

  it("a failing consent read is treated as OFF (never inferred as consent)", async () => {
    const resolveSubtree = recordingResolve();
    const out = await readConsentedStarNotes(STAR, {
      isStarConsentedFn: async () => {
        throw new Error("db down");
      },
      resolveSubtree,
      loadPageFn: recordingLoadPage({}),
    });
    expect(out).toEqual({ notes: [], truncated: false });
    expect(resolveSubtree).not.toHaveBeenCalled();
  });
});

describe("readConsentedStarNotes — consent ON reads exactly this star's subtree", () => {
  it("resolves the subtree (with this star's id) and reads each body's page", async () => {
    const resolveSubtree = recordingResolve();
    const loadPageFn = recordingLoadPage({
      [STAR]: { markdown: "the pursuit's own notes", updatedAt: 30 },
      [P1]: { markdown: "scales notes", updatedAt: 20 },
      [P2]: { markdown: "sight-reading notes", updatedAt: 10 },
    });
    const out = await readConsentedStarNotes(STAR, {
      isStarConsentedFn: async () => true,
      resolveSubtree,
      loadPageFn,
    });
    expect(resolveSubtree).toHaveBeenCalledTimes(1);
    expect(resolveSubtree).toHaveBeenCalledWith(STAR);
    expect(loadPageFn).toHaveBeenCalledTimes(3);
    // Labeled list, newest-first by updatedAt — never a sibling star/galaxy (only
    // the ids the resolver returned were ever read).
    expect(out.truncated).toBe(false);
    expect(out.notes).toEqual([
      { bodyId: STAR, bodyName: "Learning Piano", kind: "star", notes: "the pursuit's own notes" },
      { bodyId: P1, bodyName: "Scales", kind: "planet", notes: "scales notes" },
      { bodyId: P2, bodyName: "Sight-reading", kind: "planet", notes: "sight-reading notes" },
    ]);
  });

  it("orders newest-first by updatedAt regardless of subtree order", async () => {
    const out = await readConsentedStarNotes(STAR, {
      isStarConsentedFn: async () => true,
      resolveSubtree: recordingResolve(),
      loadPageFn: recordingLoadPage({
        [STAR]: { markdown: "star (oldest)", updatedAt: 1 },
        [P1]: { markdown: "p1 (newest)", updatedAt: 99 },
        [P2]: { markdown: "p2 (middle)", updatedAt: 50 },
      }),
    });
    expect(out.notes.map((n) => n.bodyId)).toEqual([P1, P2, STAR]);
  });

  it("drops bodies with no page, and empty/whitespace pages (lazy-honest)", async () => {
    const out = await readConsentedStarNotes(STAR, {
      isStarConsentedFn: async () => true,
      resolveSubtree: recordingResolve(),
      loadPageFn: recordingLoadPage({
        [STAR]: { markdown: "real notes", updatedAt: 10 },
        [P1]: null, // no page yet
        [P2]: { markdown: "   \n\t  ", updatedAt: 20 }, // whitespace-only
      }),
    });
    expect(out.notes).toEqual([
      { bodyId: STAR, bodyName: "Learning Piano", kind: "star", notes: "real notes" },
    ]);
    expect(out.truncated).toBe(false);
  });

  it("a failing page read for ONE body drops just that body (never a crash)", async () => {
    const loadPageFn = vi.fn(async (id: string) => {
      if (id === P1) throw new Error("read failed");
      return { markdown: `${id} notes`, updatedAt: 10 };
    });
    const out = await readConsentedStarNotes(STAR, {
      isStarConsentedFn: async () => true,
      resolveSubtree: recordingResolve(),
      loadPageFn,
    });
    expect(out.notes.map((n) => n.bodyId).sort()).toEqual([P2, STAR].sort());
  });

  it("a failing subtree resolve → empty, never a crash", async () => {
    const out = await readConsentedStarNotes(STAR, {
      isStarConsentedFn: async () => true,
      resolveSubtree: vi.fn(() => {
        throw new Error("resolve failed");
      }),
      loadPageFn: recordingLoadPage({}),
    });
    expect(out).toEqual({ notes: [], truncated: false });
  });

  it("an over-cap subtree truncates honestly (most-recent notes, truncated flag set)", async () => {
    const big = "x".repeat(7000); // two of these (14000) exceed STAR_MIND_NOTES_CAP (12000)
    const out = await readConsentedStarNotes(STAR, {
      isStarConsentedFn: async () => true,
      resolveSubtree: recordingResolve([
        { bodyId: STAR, bodyName: "Learning Piano", kind: "star" },
        { bodyId: P1, bodyName: "Scales", kind: "planet" },
      ]),
      loadPageFn: recordingLoadPage({
        [STAR]: { markdown: big, updatedAt: 99 }, // newest — included
        [P1]: { markdown: big, updatedAt: 1 }, // older — dropped over the cap
      }),
    });
    expect(out.truncated).toBe(true);
    expect(out.notes.map((n) => n.bodyId)).toEqual([STAR]); // the most-recent only
  });
});

describe("assembleStarNotes — the pure cap / truncation logic", () => {
  const note = (bodyId: string, updatedAt: number, len: number) => ({
    bodyId,
    bodyName: bodyId,
    kind: "planet" as const,
    notes: "x".repeat(len),
    updatedAt,
  });

  it("includes whole notes newest-first until the cap, then truncates", () => {
    const out = assembleStarNotes(
      [note("a", 10, 50), note("b", 30, 50), note("c", 20, 50)],
      120,
    );
    // Newest-first: b(30), c(20), a(10). b+c = 100 ≤ 120; +a = 150 > 120 → drop a.
    expect(out.notes.map((n) => n.bodyId)).toEqual(["b", "c"]);
    expect(out.truncated).toBe(true);
  });

  it("everything fits → not truncated, full newest-first order", () => {
    const out = assembleStarNotes(
      [note("a", 10, 10), note("b", 30, 10), note("c", 20, 10)],
      1000,
    );
    expect(out.notes.map((n) => n.bodyId)).toEqual(["b", "c", "a"]);
    expect(out.truncated).toBe(false);
  });

  it("always includes the single newest note, even if it alone exceeds the cap", () => {
    const out = assembleStarNotes([note("a", 5, 9999)], 100);
    expect(out.notes.map((n) => n.bodyId)).toEqual(["a"]);
    // Nothing else was dropped, so it is not "truncated" in the multi-note sense.
    expect(out.truncated).toBe(false);
  });

  it("the newest is kept and the rest dropped when the newest alone fills the cap", () => {
    const out = assembleStarNotes([note("a", 50, 9999), note("b", 10, 10)], 100);
    expect(out.notes.map((n) => n.bodyId)).toEqual(["a"]);
    expect(out.truncated).toBe(true);
  });

  it("empty input → empty, not truncated", () => {
    expect(assembleStarNotes([], 100)).toEqual({ notes: [], truncated: false });
  });

  it("strips the updatedAt field from the returned labeled notes", () => {
    const out = assembleStarNotes([note("a", 10, 5)], 100);
    expect(out.notes[0]).toEqual({ bodyId: "a", bodyName: "a", kind: "planet", notes: "xxxxx" });
  });

  it("defaults the cap to STAR_MIND_NOTES_CAP", () => {
    const out = assembleStarNotes([note("a", 10, STAR_MIND_NOTES_CAP + 1)]);
    expect(out.notes).toHaveLength(1); // the newest is always kept
  });
});
