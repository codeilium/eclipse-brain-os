/**
 * The wider consented read path (PRD 36 — the star mind) — the corpus-brain
 * arc's layer two. Where `readConsentedPlanetNotes` reads ONE planet's own notes,
 * this reads ONE star's whole SUBTREE: the star's own page PLUS the page of every
 * planet orbiting it — never a sibling star, never the galaxy. Read-only, gated
 * on STAR-level consent (its own gate, default off), and — because the payload is
 * now bigger and trips the rate limit sooner — CAPPED by a size limit in CODE.
 *
 * IT LIVES OUTSIDE `src/mind/` ON PURPOSE, exactly like the planet read: the mind
 * proper stays text-in/text-out. It also imports NOTHING from `@/universe` (the
 * `boundary.test.ts` Part B guarantee, widened): the star's subtree (which
 * planets orbit it) is resolved by an INJECTED `resolveSubtree` accessor whose
 * real, `@/universe`-backed implementation is wired in `page.tsx`. So the read
 * scope is "only this star's subtree" by construction — the bridge only ever
 * loads the body ids the resolver hands it, and `page.tsx` only ever hands it the
 * star + its own planets.
 *
 * The constitution, restated for the wider read (PRD 36):
 *   - **Star-level consent is the gate, default off.** A star whose consent is
 *     off never has one note read — the check happens FIRST, before any resolve
 *     or read; off means no read, no call, nothing sent.
 *   - **One star's own subtree, never wider.** The star + its orbiting planets
 *     only (resolved by the injected accessor) — never a sibling star, never the
 *     galaxy (that is PRD 37, built last). Moons are not in scope.
 *   - **Capped in code.** Over `STAR_MIND_NOTES_CAP`, the most-recent notes only,
 *     with a `truncated` flag the panel surfaces honestly. The cap is the cost
 *     lever (the PRD 33 turn-cap principle: hard limits in code, not trust).
 *   - **Read-only.** This door reads; it never creates, edits, or deletes
 *     anything (the write-sandbox stays sealed across the whole arc).
 */

import type { StarSubtreeNote } from "@/mind";
import { getSetting, loadPage, SETTINGS_KEYS } from "@/persistence";
import { isStarConsented } from "@/settings";

/**
 * The size cap, in characters, on a star's consented subtree read (PRD 36) —
 * enforced HERE, in code, never in a prompt and never on trust. The star's notes
 * + every orbiting planet's notes are sent every call; unbounded that is large,
 * expensive, and trips the 429 rate limit sooner. Over the cap the read assembles
 * the most-recent notes only and flags the truncation. Generous enough that a
 * star with a handful of worked practices fits whole; the lever that bounds cost
 * by construction once a star grows large. Codeilium's by-eye knob.
 */
export const STAR_MIND_NOTES_CAP = 12000;

/**
 * One body in a star's subtree, WITHOUT its page — what the injected
 * `resolveSubtree` returns: the star itself + each planet orbiting it. The bridge
 * loads each body's page; the result is the labeled `StarSubtreeNote` the mind
 * consumes.
 */
export interface StarSubtreeBody {
  readonly bodyId: string;
  readonly bodyName: string;
  readonly kind: "star" | "planet";
}

/** A subtree body whose page has been loaded — carries `updatedAt` for the newest-first cap. */
interface LoadedStarNote extends StarSubtreeNote {
  readonly updatedAt: number;
}

/** The consented subtree read's result: the (possibly capped) notes + whether anything was dropped. */
export interface ConsentedStarNotes {
  readonly notes: readonly StarSubtreeNote[];
  readonly truncated: boolean;
}

/**
 * Injectable dependencies — the verification seam, mirroring `readConsentedPlanetNotes`.
 * `resolveSubtree` has NO default (it needs `@/universe`, which the bridge must
 * not import) — `page.tsx` supplies the real resolver; tests inject a recording
 * fake. The consent + page reads default to the real persistence.
 */
export interface ReadStarNotesDeps {
  /** Resolve THIS star's consent. Default: read the star consent settings map. */
  readonly isStarConsentedFn?: (starId: string) => Promise<boolean>;
  /** Load a body's page. Default: `loadPage` (the `pages` store). Needs `updatedAt`. */
  readonly loadPageFn?: (
    id: string,
  ) => Promise<{ readonly markdown: string; readonly updatedAt: number } | null>;
  /**
   * Resolve the star's OWN subtree — the star + each planet orbiting it (never a
   * sibling star, never the galaxy, never a moon). Injected because the bridge
   * imports nothing from `@/universe`; `page.tsx` wires the real
   * `findStarById`-backed resolver. Called only AFTER consent passes.
   */
  readonly resolveSubtree: (starId: string) => readonly StarSubtreeBody[];
}

/**
 * Read a star's whole subtree's notes for the mind (PRD 36) — consent-gated,
 * read-only, scoped to exactly this star + its orbiting planets, and CAPPED.
 * Returns the labeled, capped notes + a `truncated` flag. Returns
 * `{ notes: [], truncated: false }` — and resolves/reads NOTHING — when:
 *   - star consent is off (the default; `resolveSubtree`/`loadPage` never called), OR
 *   - the subtree resolves empty / every page is empty.
 *
 * Never throws: a consent or resolve failure resolves to "off / nothing to read",
 * and a per-body page-read failure drops just that body (the safe defaults — a
 * failed consent read must never be treated as consent).
 */
export async function readConsentedStarNotes(
  starId: string,
  deps: ReadStarNotesDeps,
): Promise<ConsentedStarNotes> {
  const isConsented = deps.isStarConsentedFn ?? defaultIsStarConsented;

  // Consent FIRST — before any resolve or read. Off → nothing resolved, nothing
  // read, nothing sent.
  let consented: boolean;
  try {
    consented = await isConsented(starId);
  } catch {
    consented = false; // a failed consent read is NEVER consent
  }
  if (!consented) return { notes: [], truncated: false };

  // Consented: resolve the star's own subtree via the injected accessor (the
  // bridge imports no `@/universe`). Never reaches past the subtree.
  let subtree: readonly StarSubtreeBody[];
  try {
    subtree = deps.resolveSubtree(starId);
  } catch {
    return { notes: [], truncated: false }; // a failed resolve is nothing to read
  }

  const loadPageFn = deps.loadPageFn ?? loadPage;
  const loaded: LoadedStarNote[] = [];
  for (const body of subtree) {
    let page: { readonly markdown: string; readonly updatedAt: number } | null;
    try {
      page = await loadPageFn(body.bodyId);
    } catch {
      continue; // a failing read for one body drops just that body, never a crash
    }
    if (page === null) continue;
    if (page.markdown.trim() === "") continue; // lazy-honest, like savePage
    loaded.push({
      bodyId: body.bodyId,
      bodyName: body.bodyName,
      kind: body.kind,
      notes: page.markdown, // verbatim — the mind sees the notes as written
      updatedAt: page.updatedAt,
    });
  }

  return assembleStarNotes(loaded, STAR_MIND_NOTES_CAP);
}

/**
 * Assemble a star's loaded subtree notes under the size cap — PURE (PRD 36), so
 * the cap/truncation logic is unit-tested in isolation. Order the notes
 * newest-first by `updatedAt`, then include WHOLE notes (never a split note)
 * until adding the next would exceed `cap`; the newest note is always included
 * (so the read is never empty when notes exist, even if that one note alone is
 * over the cap). If any (older) note was dropped, `truncated` is true — the panel
 * says so plainly ("this star is large — reading its most recent notes").
 */
export function assembleStarNotes(
  loaded: readonly LoadedStarNote[],
  cap: number = STAR_MIND_NOTES_CAP,
): ConsentedStarNotes {
  // Newest-first; ties keep input order (a stable sort).
  const sorted = [...loaded].sort((a, b) => b.updatedAt - a.updatedAt);
  const notes: StarSubtreeNote[] = [];
  let used = 0;
  let truncated = false;
  for (const body of sorted) {
    const len = body.notes.length;
    if (notes.length === 0 || used + len <= cap) {
      notes.push({
        bodyId: body.bodyId,
        bodyName: body.bodyName,
        kind: body.kind,
        notes: body.notes,
      });
      used += len;
    } else {
      // The cap is reached — the rest are the older notes we drop. The notes are
      // already newest-first, so everything after this point is older. Honest
      // truncation, never a silent drop.
      truncated = true;
      break;
    }
  }
  return { notes, truncated };
}

/**
 * The default star-consent resolver: read the per-star consent map from the
 * settings store and resolve THIS star through the pure `isStarConsented`
 * (default off). A read failure surfaces as a thrown error to the caller, which
 * treats it as "not consented" — consent is never inferred from a junk/failed
 * read.
 */
async function defaultIsStarConsented(starId: string): Promise<boolean> {
  const raw = await getSetting(SETTINGS_KEYS.starMindConsent);
  return isStarConsented(raw, starId);
}
