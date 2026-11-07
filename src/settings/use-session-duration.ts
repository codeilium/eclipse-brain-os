"use client";

import { useCallback, useEffect, useState } from "react";

import { getSetting, setSetting, SETTINGS_KEYS } from "@/persistence";

import {
  DEFAULT_SESSION_DURATION_MS,
  resolveStoredDurationMs,
} from "./session-duration";

export interface SessionDurationState {
  /**
   * The last-used session length, in milliseconds. Seeds the launcher's duration
   * field (shown in minutes). `DEFAULT_SESSION_DURATION_MS` (25 min) until the
   * persisted value resolves on mount, then the stored last-used value.
   */
  readonly lastUsedMs: number;
  /**
   * Record a new last-used length (called when a session starts). Applies
   * immediately so the field reflects it next time; persistence is best-effort.
   */
  readonly setLastUsedMs: (ms: number) => void;
}

/**
 * The last-used focus-session length (PRD 21), parallel to `useMotionPreference`.
 * Reads the persisted value from the `settings` store on mount (falling back to
 * the 25-minute default via the pure `resolveStoredDurationMs`), and persists a
 * new value when a session begins. The value is a durable *UI preference* — the
 * length is chosen per session and remembered globally, never stored on a body in
 * the universe tree.
 *
 * Unlike the motion preference there is no `loaded` gate: a brief first-paint of
 * the default (25) before the stored value resolves is harmless (the field only
 * shows when a star is selected, and no motion depends on it).
 */
export function useSessionDuration(): SessionDurationState {
  const [lastUsedMs, setLastUsedMsState] = useState<number>(
    DEFAULT_SESSION_DURATION_MS,
  );

  // Load the persisted last-used value once. The setState runs after the await
  // (not synchronously in the effect body); failure is non-fatal — keep the
  // default. SSR-safe (the read no-ops until IndexedDB is reachable client-side).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await getSetting(SETTINGS_KEYS.lastSessionDurationMs);
        if (!cancelled) setLastUsedMsState(resolveStoredDurationMs(stored));
      } catch {
        // Ignore — a missing/failed value falls back to the default.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLastUsedMs = useCallback((ms: number) => {
    // Apply immediately (in-memory) so the field reflects it; persist in the
    // background. A persistence failure leaves the value applied for this
    // session — best-effort, never blocking the start of a session.
    setLastUsedMsState(ms);
    void setSetting(SETTINGS_KEYS.lastSessionDurationMs, String(ms)).catch(() => {
      /* best-effort persistence */
    });
  }, []);

  return { lastUsedMs, setLastUsedMs };
}
