import type { Universe } from "@/universe";

import { getDB, UNIVERSE_KEY, UNIVERSE_STORE } from "./db";
import {
  ConcurrentModificationError,
  PersistenceError,
  QuotaExceededError,
} from "./errors";
import { validateUniverse } from "./validation";

/**
 * Track the `lastModified` value we observed when loading. Used to detect
 * concurrent writes from other tabs (see `saveUniverse`).
 */
let lastObservedModification: string | null = null;

/**
 * Save the universe to IndexedDB. Throws if the underlying write fails (quota
 * exceeded, etc.) or if another tab has saved a newer version since we loaded.
 *
 * After a successful save, updates the `lastObservedModification` tracker and
 * broadcasts the new state to other tabs via BroadcastChannel.
 */
export async function saveUniverse(universe: Universe): Promise<void> {
  // Concurrent-tab check: if we observed a version on load and the stored
  // record now has a NEWER `lastModified` than both what we observed and what
  // we're about to write, another tab beat us to it.
  const observed = lastObservedModification;
  if (observed !== null) {
    try {
      const db = await getDB();
      const existing = await db.get(UNIVERSE_STORE, UNIVERSE_KEY);
      if (
        existing &&
        typeof existing.lastModified === "string" &&
        existing.lastModified > observed &&
        existing.lastModified > universe.lastModified
      ) {
        throw new ConcurrentModificationError(universe.lastModified, existing.lastModified);
      }
    } catch (e) {
      if (e instanceof ConcurrentModificationError) throw e;
      // Other read errors are non-fatal here; we proceed with the save attempt.
    }
  }

  try {
    const db = await getDB();
    await db.put(UNIVERSE_STORE, universe, UNIVERSE_KEY);
    lastObservedModification = universe.lastModified;
    broadcastSave(universe.lastModified);
  } catch (e) {
    if (isQuotaError(e)) {
      throw new QuotaExceededError(
        "IndexedDB quota exceeded — the universe could not be saved.",
        e,
      );
    }
    throw new PersistenceError(`Failed to save universe: ${describeError(e)}`, e);
  }
}

/**
 * Load the universe from IndexedDB. Returns null if no universe exists yet
 * (first launch). Throws `CorruptDataError` if the stored data is malformed, or
 * another `PersistenceError` subclass for other failures.
 */
export async function loadUniverse(): Promise<Universe | null> {
  try {
    const db = await getDB();
    const data = await db.get(UNIVERSE_STORE, UNIVERSE_KEY);
    if (data === undefined) {
      return null;
    }
    validateUniverse(data);
    lastObservedModification = data.lastModified;
    return data;
  } catch (e) {
    if (e instanceof PersistenceError) throw e;
    throw new PersistenceError(`Failed to load universe: ${describeError(e)}`, e);
  }
}

/**
 * Clear the universe from IndexedDB. Used by tests and (eventually) a "reset
 * universe" UI option. Resets the concurrent-modification tracker.
 */
export async function clearUniverse(): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(UNIVERSE_STORE, UNIVERSE_KEY);
    lastObservedModification = null;
  } catch (e) {
    throw new PersistenceError(`Failed to clear universe: ${describeError(e)}`, e);
  }
}

/**
 * Reset the in-memory concurrent-modification tracker. Used by tests to
 * simulate "tab just opened" scenarios.
 */
export function resetConcurrencyTracker(): void {
  lastObservedModification = null;
}

// --- helpers ---

const CHANNEL_NAME = "eclipse-brain-os-saves";
let broadcastChannel: BroadcastChannel | null = null;

function broadcastSave(lastModified: string): void {
  if (typeof BroadcastChannel === "undefined") return;
  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  }
  broadcastChannel.postMessage({ type: "save", lastModified });
}

function isQuotaError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const name = (e as { name?: unknown }).name;
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

function describeError(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}
