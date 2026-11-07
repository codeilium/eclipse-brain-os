/**
 * Page persistence (PRD 17) — one plain-markdown page (a notebook) per body,
 * stored in its own `pages` IndexedDB store keyed by body id. This is the seam
 * the dock (PRD 18) and the AI (later) read and write page content through.
 *
 * Pages live OUTSIDE the universe record — the same external, id-keyed pattern
 * as `settings.ts` — so a continuously-autosaving notebook never rewrites the
 * whole universe tree (it writes only its own small record), and page content
 * gets its own failure domain. The `@/universe` model stays pure (structure +
 * earned state); it has no `page` field. See `.claude/docs/persistence-layer.md`
 * for the decision and the why-not-in-the-record reasoning.
 *
 * Lazy create-on-write (honest-universe): a record exists only once it has real
 * content. `loadPage` on a body with no page returns `null`; saving empty
 * markdown DELETES the record — only real pages exist, the storage mirror of
 * "the canvas shows only what exists".
 */

import { getDB, PAGES_STORE } from "./db";
import { PersistenceError } from "./errors";

/**
 * A body's page. Keyed in the store by `id` (the star/planet/moon id — globally
 * unique, so one store serves every body type). `markdown` is a plain markdown
 * string (plain-first; a richer format is a future additive value change, e.g. a
 * `format` field). `updatedAt` is epoch ms of the last write.
 */
export interface Page {
  readonly id: string;
  readonly markdown: string;
  readonly updatedAt: number;
}

/**
 * Load a body's page. Returns `null` when the body has no page yet — the lazy
 * default, since no record is written until the first non-empty save. Throws a
 * `PersistenceError` only on an actual DB failure (a miss is `null`, not an
 * error).
 */
export async function loadPage(id: string): Promise<Page | null> {
  try {
    const db = await getDB();
    const page = await db.get(PAGES_STORE, id);
    return page ?? null;
  } catch (e) {
    throw new PersistenceError(`Failed to load page "${id}": ${describe(e)}`, e);
  }
}

/**
 * Save a body's page (create or update). Lazy + honest: **empty markdown
 * (whitespace-only included) deletes the record and returns `null`** — an empty
 * notebook is not a real thing, so no record represents it. A non-empty save
 * writes `{ id, markdown, updatedAt: now }` (the raw markdown is preserved
 * verbatim — only the emptiness *decision* trims) and returns the stored page.
 */
export async function savePage(
  id: string,
  markdown: string,
): Promise<Page | null> {
  if (markdown.trim().length === 0) {
    await deletePage(id);
    return null;
  }
  const page: Page = { id, markdown, updatedAt: Date.now() };
  try {
    const db = await getDB();
    await db.put(PAGES_STORE, page, id);
    return page;
  } catch (e) {
    throw new PersistenceError(`Failed to save page "${id}": ${describe(e)}`, e);
  }
}

/** Delete a body's page record. A missing record is a harmless no-op. */
export async function deletePage(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(PAGES_STORE, id);
  } catch (e) {
    throw new PersistenceError(
      `Failed to delete page "${id}": ${describe(e)}`,
      e,
    );
  }
}

/**
 * Delete a set of page records in one transaction — the cascade cleanup run when
 * a body is deleted (its subtree's ids, from `subtreeIds`). **Best-effort:** any
 * failure is swallowed, never thrown, so it can never block or fail a delete.
 * Orphaned page records (keyed by a now-dead id) are harmless — they are never
 * read — so this is tidiness, not correctness.
 */
export async function deletePages(ids: Iterable<string>): Promise<void> {
  const idList = Array.from(ids);
  if (idList.length === 0) return;
  try {
    const db = await getDB();
    const tx = db.transaction(PAGES_STORE, "readwrite");
    await Promise.all([...idList.map((id) => tx.store.delete(id)), tx.done]);
  } catch {
    // Best-effort: orphaned page records are never read, so a failed cleanup is
    // harmless. Never throw into a delete handler.
  }
}

function describe(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}
