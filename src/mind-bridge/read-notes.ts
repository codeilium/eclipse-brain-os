/**
 * The consented read path (PRD 34 — the planet mind) — the ONE audited door by
 * which a note ever reaches the mind. This is the seam that, for the first time,
 * deliberately opens the PRD 26 read-sandbox: it reads a body's notes from
 * persistence. It opens that boundary as narrowly as possible — one planet's
 * OWN notes, only with that planet's explicit consent, read-only.
 *
 * IT LIVES OUTSIDE `src/mind/` ON PURPOSE. The mind proper
 * (`src/mind/`) stays text-in/text-out — it imports nothing from
 * `@/persistence` and receives plain strings. This thin bridge does the
 * consented reading and hands strings *into* the mind. The two halves are
 * pinned by the rewritten `src/mind/boundary.test.ts`: the mind imports nothing
 * earned; this bridge reads notes ONLY via the consented path below and writes
 * NOTHING (it imports only read accessors — `loadPage`, `getSetting`,
 * `SETTINGS_KEYS` — plus the pure `isPlanetConsented`; never a write accessor,
 * never `@/universe`).
 *
 * The constitution, restated for the read-opening (PRD 34):
 *   - **Consent is the gate, default off.** A planet whose consent is off never
 *     has one note read — the check happens FIRST, before any read; off means no
 *     read, no call, nothing sent.
 *   - **One planet's own notes, never wider.** The read is exactly
 *     `loadPage(planetId)` — never a sibling, never the parent star, never the
 *     galaxy. (The star mind [PRD 35] and the galaxy mind [PRD 36] widen the
 *     scope; that is explicitly NOT this PRD.)
 *   - **Read-only.** This door reads; it never creates, edits, or deletes
 *     anything (the write-sandbox stays sealed across the whole arc).
 */

import { getSetting, loadPage, SETTINGS_KEYS } from "@/persistence";
import { isPlanetConsented } from "@/settings";

/**
 * Injectable dependencies — the verification seam, mirroring the mind client's
 * injectable `fetchFn`. Defaults wire the real persistence; a test injects
 * recording fakes to prove the gate (consent off → `loadPageFn` is NEVER
 * called) and the scope (consent on → `loadPageFn` is called exactly once with
 * this `planetId`).
 */
export interface ReadNotesDeps {
  /** Resolve THIS planet's consent. Default: read the consent settings map. */
  readonly isPlanetConsentedFn?: (planetId: string) => Promise<boolean>;
  /** Load THIS planet's page. Default: `loadPage` (the `pages` store). */
  readonly loadPageFn?: (id: string) => Promise<{ readonly markdown: string } | null>;
}

/**
 * Read a planet's own notes for the mind — consent-gated, read-only, scoped to
 * exactly one planet's page. Returns plain strings (a `string[]` — one element
 * today, the planet's own notebook; the shape is forward-compatible with the
 * PRD 35 star mind's wider read). Returns `[]` — and reads NOTHING — when:
 *   - consent for this planet is off (the default), OR
 *   - the planet has no page yet, OR
 *   - the page is empty/whitespace-only (lazy-honest, like `savePage`).
 *
 * Never throws: a persistence failure resolves to "off / nothing to read" (the
 * safe, silent default — a failed consent read must never be treated as
 * consent).
 */
export async function readConsentedPlanetNotes(
  planetId: string,
  deps: ReadNotesDeps = {},
): Promise<string[]> {
  const isConsented = deps.isPlanetConsentedFn ?? defaultIsPlanetConsented;

  // Consent FIRST — before any read. Off → no read, no call, nothing sent.
  let consented: boolean;
  try {
    consented = await isConsented(planetId);
  } catch {
    consented = false; // a failed consent read is NEVER consent
  }
  if (!consented) return [];

  // Consented: read exactly this one planet's own page — nothing wider.
  const loadPageFn = deps.loadPageFn ?? loadPage;
  let page: { readonly markdown: string } | null;
  try {
    page = await loadPageFn(planetId);
  } catch {
    return []; // a failed read is nothing to reflect on, never a crash
  }
  if (page === null) return [];
  if (page.markdown.trim() === "") return [];
  return [page.markdown];
}

/**
 * The default consent resolver: read the per-planet consent map from the
 * settings store and resolve THIS planet through the pure `isPlanetConsented`
 * (default off). A read failure surfaces as a thrown error to the caller, which
 * treats it as "not consented" — consent is never inferred from a junk/failed
 * read.
 */
async function defaultIsPlanetConsented(planetId: string): Promise<boolean> {
  const raw = await getSetting(SETTINGS_KEYS.planetMindConsent);
  return isPlanetConsented(raw, planetId);
}
