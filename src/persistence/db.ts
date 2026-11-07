import { type DBSchema, type IDBPDatabase, openDB } from "idb";

import type { Universe } from "@/universe";
import type { Page } from "./pages";
import { runMigrations } from "./schema";

/**
 * IndexedDB database name. Scoped per browser origin — `localhost:3000` and
 * `eclipsebrainos.com` get separate databases. This is browser-level isolation,
 * not something we enforce.
 */
export const DB_NAME = "eclipse-brain-os";

/**
 * Object store name. There is exactly one record in this store: the user's
 * universe, keyed by UNIVERSE_KEY. V1 has one universe per origin.
 */
export const UNIVERSE_STORE = "universe";
export const UNIVERSE_KEY = "current";

/**
 * App-settings object store (PRD 15). A small key→value store for durable *UI
 * preferences* — distinct from universe *data*. V1 holds exactly one key: the
 * reduced-motion preference (`settings.ts`). Kept here, not in `localStorage`,
 * so the project's "no web storage; everything durable lives in IndexedDB"
 * convention holds — a deliberate, flagged choice (PRD 15). The future quality
 * toggle (deferred) reuses this same store.
 */
export const SETTINGS_STORE = "settings";

/**
 * Pages object store (PRD 17). One plain-markdown page (a notebook) per body,
 * keyed by the body id (star/planet/moon — ids are globally unique, so one store
 * serves every body type). Value: `{ id, markdown, updatedAt }`. Lives here,
 * OUTSIDE the universe record — the same external, id-keyed pattern as
 * `settings` — so a continuously-autosaving notebook never rewrites the whole
 * universe tree, and page content gets its own failure domain. The `@/universe`
 * model is untouched (no `page` field); pages attach by id. See `pages.ts`.
 */
export const PAGES_STORE = "pages";

/**
 * IndexedDB *structural* version. Bumping this triggers a migration via
 * `runMigrations(db, oldVersion, newVersion)`. v1 created the `universe` store;
 * v2 (PRD 15) added the `settings` store; v3 (PRD 17) adds the `pages` store.
 * NOTE: this is the IndexedDB schema version, **decoupled** from
 * `Universe.schemaVersion` (still 1) — they evolve independently (a new *store*
 * is not a change to the universe *record*).
 */
export const DB_VERSION = 3;

/**
 * Typed IndexedDB schema for idb. Extends idb's `DBSchema` so it satisfies
 * `openDB`'s generic constraint and so the computed store-name key is checked
 * against the store-value shape.
 */
export interface EclipseDBSchema extends DBSchema {
  [UNIVERSE_STORE]: {
    key: string;
    value: Universe;
  };
  [SETTINGS_STORE]: {
    key: string;
    // A JSON-serializable preference value. V1 stores only string enums (the
    // motion preference); kept as `string` so `getSetting`/`setSetting` stay
    // simple and the typed meaning is applied by the caller (`isMotionPreference`).
    value: string;
  };
  [PAGES_STORE]: {
    // The body id (star/planet/moon). Globally unique, so one store serves all
    // body types. Pages attach to bodies by id, externally — the `@/universe`
    // model is untouched (no `page` field on any body).
    key: string;
    value: Page;
  };
}

let dbPromise: Promise<IDBPDatabase<EclipseDBSchema>> | null = null;

/**
 * Open (or create) the IndexedDB database. Singleton — subsequent calls return
 * the cached connection promise. Runs migrations if needed.
 */
export function getDB(): Promise<IDBPDatabase<EclipseDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<EclipseDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion) {
        runMigrations(db, oldVersion, newVersion ?? DB_VERSION);
      },
      blocked() {
        // Another tab is holding a connection at an older version. Rare, but
        // possible. We just wait.
        console.warn("[persistence] Upgrade blocked — another tab has an older connection.");
      },
      blocking() {
        // We're holding a connection that's blocking a newer version. Close.
        if (dbPromise) {
          void dbPromise.then((db) => db.close());
          dbPromise = null;
        }
      },
      terminated() {
        // Connection was terminated unexpectedly (browser closed the DB).
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

/** Close the DB connection. Used by tests for cleanup; rarely needed in app code. */
export async function closeDB(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
}
