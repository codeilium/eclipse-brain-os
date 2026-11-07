"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { getSetting, setSetting, SETTINGS_KEYS } from "@/persistence";

import {
  DEFAULT_MOTION_PREFERENCE,
  isMotionPreference,
  resolveReducedMotion,
  type MotionPreference,
} from "./motion-preference";

/** The CSS media feature for OS-level reduced-motion. */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const hasMatchMedia = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

/**
 * Subscribe to OS reduced-motion changes (the external store). Read once via
 * `getOsReducedSnapshot`, then re-read whenever the user flips the OS setting
 * while the app is open. Stable module-level fns so `useSyncExternalStore`
 * doesn't re-subscribe each render.
 */
function subscribeOsReduced(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => {};
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const getOsReducedSnapshot = (): boolean =>
  hasMatchMedia() ? window.matchMedia(REDUCED_MOTION_QUERY).matches : false;

/** SSR snapshot: no media query on the server — default to full motion. */
const getOsReducedServerSnapshot = (): boolean => false;

export interface MotionPreferenceState {
  /** The resolved "reduce motion?" value (OS query combined with the override). */
  readonly reduced: boolean;
  /** The user's stored override (`system` | `reduce` | `allow`). */
  readonly preference: MotionPreference;
  /** Set + persist the override. Applies immediately; persistence is best-effort. */
  readonly setPreference: (preference: MotionPreference) => void;
  /**
   * True once the persisted preference has been read (or has failed and fallen
   * back to the default). `page.tsx` gates the canvas mount on this so a
   * force-reduce user never sees a frame of motion before the override resolves.
   */
  readonly loaded: boolean;
}

/**
 * The reduced-motion source of truth (PRD 15). Combines the OS
 * `prefers-reduced-motion` media query (subscribed via `useSyncExternalStore` —
 * read once + on change, SSR-safe) with the user's persisted override into a
 * single resolved `reduced` boolean, via the pure `resolveReducedMotion`. Read
 * here in `page.tsx` and threaded *down* into the canvas as one prop — the loops
 * never query the media query per frame (`r3f-conventions.md` §6.4).
 *
 * The override persists in IndexedDB (a deliberate, durable choice — unlike the
 * ephemeral perf state, PRD 14). A read failure is non-fatal: it falls back to
 * the default (`system`), because a missing preference must never break the app,
 * least of all the accessibility path.
 */
export function useMotionPreference(): MotionPreferenceState {
  const osReduced = useSyncExternalStore(
    subscribeOsReduced,
    getOsReducedSnapshot,
    getOsReducedServerSnapshot,
  );

  const [preference, setPreferenceState] = useState<MotionPreference>(
    DEFAULT_MOTION_PREFERENCE,
  );
  const [loaded, setLoaded] = useState(false);

  // Load the persisted override once. The setState calls run after the await
  // (not synchronously in the effect body), and failure is non-fatal — keep the
  // default. SSR-safe (the read no-ops until IndexedDB is reachable client-side).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await getSetting(SETTINGS_KEYS.motionPreference);
        if (!cancelled && isMotionPreference(stored)) {
          setPreferenceState(stored);
        }
      } catch {
        // Ignore — a missing/failed preference falls back to the default.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: MotionPreference) => {
    // Apply immediately (in-memory) so the UI responds at once; persist in the
    // background. A persistence failure leaves the value applied for this
    // session — best-effort, never blocking the toggle.
    setPreferenceState(next);
    void setSetting(SETTINGS_KEYS.motionPreference, next).catch(() => {
      /* best-effort persistence */
    });
  }, []);

  const reduced = resolveReducedMotion(osReduced, preference);
  return { reduced, preference, setPreference, loaded };
}
