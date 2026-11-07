/**
 * Eclipse Brain OS — the mind bridge (PRD 34, the planet mind).
 *
 * The thin, audited seam between the persistence layer and the mind. It exists
 * so the mind proper (`src/mind/`) can stay text-in/text-out — importing
 * NOTHING earned — while consented read paths hand plain data into it. It writes
 * nothing and reaches no further than what the person consented to read:
 *   - `readConsentedPlanetNotes` (PRD 34): ONE consenting planet's own page.
 *   - `readConsentedStarNotes` (PRD 36): ONE consenting star's whole subtree —
 *     the star + its orbiting planets, CAPPED, with the subtree resolved by an
 *     INJECTED accessor (so the bridge still imports nothing from `@/universe`).
 * Both halves of the guarantee — imports nothing earned, writes nothing — are
 * pinned by `src/mind/boundary.test.ts`. See `read-notes.ts` / `read-star-notes.ts`
 * for the constitution restated for each read-opening.
 */

export {
  readConsentedPlanetNotes,
  type ReadNotesDeps,
} from "./read-notes";
export {
  assembleStarNotes,
  readConsentedStarNotes,
  STAR_MIND_NOTES_CAP,
  type ConsentedStarNotes,
  type ReadStarNotesDeps,
  type StarSubtreeBody,
} from "./read-star-notes";
