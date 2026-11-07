/**
 * App-settings persistence (PRD 15) — a tiny key→value accessor over the
 * `settings` IndexedDB store. Distinct from the universe repository: settings
 * are durable *UI preferences* (the reduced-motion choice today; the deferred
 * quality toggle tomorrow), not universe *data*. No validation/migration of a
 * universe record, no concurrent-tab tracking — just read/write a small value.
 *
 * Kept in IndexedDB (not `localStorage`) so the project's "everything durable
 * lives in IndexedDB" convention holds; the caller applies the typed meaning
 * (e.g. `isMotionPreference`) and decides the fallback on a read miss/failure.
 */

import { getDB, SETTINGS_STORE } from "./db";
import { PersistenceError } from "./errors";

/** Stable keys for the settings store (avoids stringly-typed call sites). */
export const SETTINGS_KEYS = {
  /** The reduced-motion preference: "system" | "reduce" | "allow" (PRD 15). */
  motionPreference: "motionPreference",
  /**
   * The last-used focus-session length, in milliseconds, stored as a string
   * (PRD 21). The launcher's duration field pre-fills with this; the typed
   * meaning + fallback (`POMODORO_DURATION_MS` on first run) is applied by the
   * caller (`resolveStoredDurationMs` in `@/settings`). Just another key in this
   * store — no new store, no schema bump.
   */
  lastSessionDurationMs: "lastSessionDurationMs",
  /**
   * The last-viewed galaxy's id (PRD 27). The observatory reopens on this sky;
   * the typed meaning + fallback (the universe's first galaxy when the stored
   * id is missing/stale) is applied by the caller (`resolveStoredGalaxyId` in
   * `@/settings`). Just another key in this store — no new store, no schema
   * bump, no `localStorage`.
   */
  lastViewedGalaxyId: "lastViewedGalaxyId",
  /**
   * The person's own Anthropic API key (PRD 28 — the fog distiller; the
   * owner's-own-key phase). Managed by the settings panel through
   * `useAnthropicKey` (`@/settings`): masked on entry, NEVER displayed back,
   * never logged, never in an error message. Lives only here — this browser's
   * IndexedDB on this machine (right for a personal build; a shipped product
   * routes through a backend — the V2 wall, `decisions-log.md` PRD 28). Just
   * another key in this store — no new store, no schema bump, no
   * `localStorage`.
   */
  anthropicApiKey: "anthropicApiKey",
  /**
   * Per-planet "its mind may read its notes" consent (PRD 34 — the planet
   * mind; the first deliberate opening of the PRD 26 read-sandbox). Stored as a
   * JSON map `{ [planetId]: true }` under this ONE stable key — additive,
   * **default off** (an absent id is off), revocable (revoking removes the id),
   * and deliberately NOT in the universe's earned record (consent is a UI
   * preference, never a fact about the work). The pure logic
   * (`isPlanetConsented` / `withPlanetConsent`) + the live hook
   * (`usePlanetMindConsent`) live in `@/settings`; this mirrors the
   * `anthropicApiKey` seam exactly. No new store, no schema bump, no
   * `localStorage`. Off means: a planet you never enable never has one note
   * read or sent.
   */
  planetMindConsent: "planetMindConsent",
  /**
   * Per-star "its mind may read its subtree" consent (PRD 36 — the star mind;
   * the corpus-brain arc, layer two). Stored as a JSON map `{ [starId]: true }`
   * under this ONE stable key — additive, **default off** (an absent id is off),
   * revocable (revoking removes the id), and deliberately NOT in the universe's
   * earned record (consent is a UI preference, never a fact about the work).
   * Separate from `planetMindConsent`: consenting to read a whole subtree (a
   * star + every practice orbiting it) is a larger act than consenting to one
   * practice, so it is its own decision. The pure logic (`isStarConsented` /
   * `withStarConsent`) + the live hook (`useStarMindConsent`) live in
   * `@/settings`; this mirrors the `planetMindConsent` seam exactly. No new
   * store, no schema bump, no `localStorage`. Off means: a star you never enable
   * never has one note — its own or a practice's — read or sent.
   */
  starMindConsent: "starMindConsent",
} as const;

/**
 * Read a setting. Returns `undefined` when nothing is stored for the key (first
 * launch / never set). Throws a `PersistenceError` only on an actual DB failure.
 */
export async function getSetting(key: string): Promise<string | undefined> {
  try {
    const db = await getDB();
    return await db.get(SETTINGS_STORE, key);
  } catch (e) {
    throw new PersistenceError(`Failed to read setting "${key}": ${describe(e)}`, e);
  }
}

/** Write a setting (overwrites any previous value for the key). */
export async function setSetting(key: string, value: string): Promise<void> {
  try {
    const db = await getDB();
    await db.put(SETTINGS_STORE, value, key);
  } catch (e) {
    throw new PersistenceError(`Failed to write setting "${key}": ${describe(e)}`, e);
  }
}

/**
 * Remove a setting entirely (PRD 28 — clearing the stored API key). A true
 * delete, not an empty-string write: nothing residual remains in the store.
 * Deleting a key that was never set is a no-op.
 */
export async function deleteSetting(key: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(SETTINGS_STORE, key);
  } catch (e) {
    throw new PersistenceError(`Failed to delete setting "${key}": ${describe(e)}`, e);
  }
}

function describe(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}
