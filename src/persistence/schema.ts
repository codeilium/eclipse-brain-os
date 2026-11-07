import type { IDBPDatabase } from "idb";

import {
  type EclipseDBSchema,
  PAGES_STORE,
  SETTINGS_STORE,
  UNIVERSE_STORE,
} from "./db";

/**
 * Run migrations from oldVersion to newVersion. Called inside an IndexedDB
 * upgrade transaction.
 *
 * Each migration step is responsible for taking the DB from version N to N+1,
 * and the steps run in sequence — a fresh install (oldVersion 0 → newVersion 3)
 * runs `0 → 1`, `1 → 2`, and `2 → 3`; an existing v2 user runs only `2 → 3`.
 * Each step guards `createObjectStore` with a `contains` check so it is
 * idempotent. See `.claude/docs/persistence-layer.md` for how to write a data
 * migration.
 */
export function runMigrations(
  db: IDBPDatabase<EclipseDBSchema>,
  oldVersion: number,
  newVersion: number,
): void {
  // Migration 0 → 1: initial schema. Create the universe store.
  if (oldVersion < 1 && newVersion >= 1) {
    if (!db.objectStoreNames.contains(UNIVERSE_STORE)) {
      db.createObjectStore(UNIVERSE_STORE);
    }
  }

  // Migration 1 → 2 (PRD 15): add the app-settings store. Additive only — the
  // universe store and its single record are untouched, so an existing user's
  // universe survives the upgrade intact; they simply gain a place to persist
  // the reduced-motion preference.
  if (oldVersion < 2 && newVersion >= 2) {
    if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
      db.createObjectStore(SETTINGS_STORE);
    }
  }

  // Migration 2 → 3 (PRD 17): add the pages store (one plain-markdown page per
  // body, keyed by body id). Additive only — the universe and settings stores
  // and their records are untouched, so an existing user keeps their universe
  // AND their motion preference; they simply gain a place to store page content.
  if (oldVersion < 3 && newVersion >= 3) {
    if (!db.objectStoreNames.contains(PAGES_STORE)) {
      db.createObjectStore(PAGES_STORE);
    }
  }
}
