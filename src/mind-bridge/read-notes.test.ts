import { describe, expect, it, vi } from "vitest";

import { readConsentedPlanetNotes } from "./read-notes";

const PLANET = "planet-42";
const NOTES = "# scales\n\nworked through C major today; left hand still stiff.";

/** A recording fake page-loader — proves WHETHER and WITH WHAT it is called. */
function recordingLoadPage(page: { markdown: string } | null) {
  return vi.fn(async () => page);
}

describe("readConsentedPlanetNotes — consent is the gate (off → no read, no call)", () => {
  it("consent OFF → returns [] and NEVER calls loadPage (nothing is read)", async () => {
    const loadPageFn = recordingLoadPage({ markdown: NOTES });
    const out = await readConsentedPlanetNotes(PLANET, {
      isPlanetConsentedFn: async () => false,
      loadPageFn,
    });
    expect(out).toEqual([]);
    expect(loadPageFn).not.toHaveBeenCalled(); // off means no read, no call, nothing sent
  });

  it("a failing consent read is treated as OFF (never inferred as consent)", async () => {
    const loadPageFn = recordingLoadPage({ markdown: NOTES });
    const out = await readConsentedPlanetNotes(PLANET, {
      isPlanetConsentedFn: async () => {
        throw new Error("db down");
      },
      loadPageFn,
    });
    expect(out).toEqual([]);
    expect(loadPageFn).not.toHaveBeenCalled();
  });
});

describe("readConsentedPlanetNotes — consent ON reads exactly ONE planet's own page", () => {
  it("calls loadPage EXACTLY ONCE, with exactly this planet's id, and returns its notes", async () => {
    const loadPageFn = recordingLoadPage({ markdown: NOTES });
    const out = await readConsentedPlanetNotes(PLANET, {
      isPlanetConsentedFn: async () => true,
      loadPageFn,
    });
    expect(out).toEqual([NOTES]);
    expect(loadPageFn).toHaveBeenCalledTimes(1);
    expect(loadPageFn).toHaveBeenCalledWith(PLANET); // one planet — never a sibling/parent/galaxy
  });

  it("consent on + no page yet → [] (nothing to reflect on)", async () => {
    const loadPageFn = recordingLoadPage(null);
    const out = await readConsentedPlanetNotes(PLANET, {
      isPlanetConsentedFn: async () => true,
      loadPageFn,
    });
    expect(out).toEqual([]);
    expect(loadPageFn).toHaveBeenCalledTimes(1);
  });

  it("consent on + an empty/whitespace page → [] (lazy-honest, like savePage)", async () => {
    const out = await readConsentedPlanetNotes(PLANET, {
      isPlanetConsentedFn: async () => true,
      loadPageFn: recordingLoadPage({ markdown: "   \n\t  " }),
    });
    expect(out).toEqual([]);
  });

  it("a failing page read → [] (never a crash)", async () => {
    const out = await readConsentedPlanetNotes(PLANET, {
      isPlanetConsentedFn: async () => true,
      loadPageFn: vi.fn(async () => {
        throw new Error("read failed");
      }),
    });
    expect(out).toEqual([]);
  });

  it("preserves the markdown verbatim (the mind sees the notes as written)", async () => {
    const raw = "  leading and trailing space is kept inside the note  ";
    const out = await readConsentedPlanetNotes(PLANET, {
      isPlanetConsentedFn: async () => true,
      loadPageFn: recordingLoadPage({ markdown: raw }),
    });
    expect(out).toEqual([raw]);
  });
});
