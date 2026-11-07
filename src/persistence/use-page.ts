"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { loadPage, savePage } from "./pages";

/**
 * Debounce window for page autosave — how long after the last keystroke we
 * persist. ~half a second feels instant to the user while collapsing a burst of
 * typing into a single small write (PRD 17; the dock that drives it is PRD 18).
 */
export const AUTOSAVE_DEBOUNCE_MS = 500;

export type PageStatus = "loading" | "idle" | "saving" | "saved" | "error";

export interface PageState {
  /** The page's current markdown — the loaded content, then live local edits. */
  readonly content: string;
  /** Update the content + schedule a debounced autosave (~`AUTOSAVE_DEBOUNCE_MS`). */
  readonly save: (markdown: string) => void;
  /** Where the page is in its load/save lifecycle (drives a future "saved" cue). */
  readonly status: PageStatus;
}

/**
 * Per-body page state with debounced autosave (PRD 17) — the React seam the dock
 * (PRD 18) will mount, parallel to `useUniverse()`. Loads the page for `id` on
 * mount and whenever `id` changes (`null` = nothing open → empty/idle, no read);
 * `save(markdown)` updates the displayed content immediately (optimistic) and
 * persists ~`AUTOSAVE_DEBOUNCE_MS` after typing stops. Empty markdown deletes the
 * record (lazy/honest — see `savePage`). A pending edit is flushed before the id
 * switches or the hook unmounts, so the last keystrokes are never lost.
 *
 * Optional `draft` (PRD 35): when provided, the editor opens prefilled with it
 * (the approved planet-mind proposal applied to the note) and it is persisted
 * through this same save path — the human's edit, not the mind's. Applied once,
 * at load, via the `draftRef` above; omitted → behavior unchanged.
 *
 * Built but not yet consumed — the dock that opens a page is PRD 18. React-
 * dependent (like `useUniverse`), so it is verified by construction + the
 * `pages.ts` tests, not unit-tested.
 */
export function usePage(id: string | null, draft?: string): PageState {
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<PageStatus>("idle");

  // Refs so the debounced writer always persists the freshest id + markdown,
  // never a stale closure (the `useUniverse` ref pattern). `timer` holds the
  // pending autosave; `pending` is the markdown awaiting that write.
  const idRef = useRef<string | null>(id);
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist whatever edit is pending, now — used both by the debounce timer and
  // when flushing before an id switch / unmount so the last edit is never lost.
  // `targetId` is captured synchronously, so a flush triggered by a switch still
  // writes to the OUTGOING id; the status is only updated if we are still on that
  // page (a later switch's own load owns the status otherwise).
  const flush = useCallback(async () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const markdown = pendingRef.current;
    const targetId = idRef.current;
    if (markdown === null || targetId === null) return;
    pendingRef.current = null;
    try {
      await savePage(targetId, markdown);
      if (idRef.current === targetId) setStatus("saved");
    } catch {
      if (idRef.current === targetId) setStatus("error");
    }
  }, []);

  // Declared above the load effect (PRD 35) so that effect can seed an approved
  // proposal's draft through this same save path — the one human-confirmed
  // page-save. Updates the displayed content immediately (optimistic) and
  // schedules the debounced persist.
  const save = useCallback(
    (markdown: string) => {
      setContent(markdown);
      pendingRef.current = markdown;
      setStatus("saving");
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flush();
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  // Load on mount + whenever the id changes. The cleanup flushes a pending edit
  // for the OUTGOING id first (it still reads the old `idRef`, since the next
  // effect run sets the new id afterward) — so a fast switch neither loses the
  // edit nor writes it to the new body. Cancellable so a stale load can't clobber
  // a newer one.
  useEffect(() => {
    idRef.current = id;
    let cancelled = false;

    // All state changes happen inside this async callback (never synchronously
    // in the effect body) — the `useUniverse` pattern, and what keeps cascading
    // renders out of the effect.
    void (async () => {
      if (id === null) {
        if (!cancelled) {
          setContent("");
          setStatus("idle");
        }
        return;
      }
      setStatus("loading");
      try {
        const page = await loadPage(id);
        if (cancelled) return;
        if (draft !== undefined) {
          // An approved proposal's draft for this page (PRD 35): show it editable
          // and persist it through the normal save path — the human approved, so
          // the editor writes it; the mind never does. The seed is the loaded
          // note with the change already applied, so the loaded content is
          // superseded by design. The dock remounts when a fresh draft arrives
          // (its key carries the draft's planet id), so `draft` is constant for
          // this mount → applied exactly once, never re-clobbering later edits.
          save(draft);
        } else {
          setContent(page?.markdown ?? "");
          setStatus("idle");
        }
      } catch {
        if (cancelled) return;
        setContent("");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      void flush();
    };
  }, [id, flush, save, draft]);

  return { content, save, status };
}
