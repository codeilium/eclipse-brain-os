"use client";

import { useCallback, useEffect, useState } from "react";

import { getSetting, setSetting, SETTINGS_KEYS } from "@/persistence";
import type { GalaxyId } from "@/universe";

export interface CurrentGalaxyState {
  /**
   * The raw stored last-viewed galaxy id, or `undefined` when nothing is stored
   * (first run) or the value hasn't resolved yet. The typed meaning + fallback
   * live in the pure `resolveStoredGalaxyId` — the caller resolves this against
   * the universe's real galaxies.
   */
  readonly storedGalaxyId: string | undefined;
  /**
   * True once the persisted value has resolved (or failed — the fallback then
   * applies). Unlike `useSessionDuration` this hook carries a loaded gate (the
   * `useMotionPreference` precedent): without it, a reload would first paint the
   * first galaxy and then visibly remount onto the stored one — a wrong-sky
   * flash. The canvas + the stars-dependent overlays wait for it.
   */
  readonly galaxyLoaded: boolean;
  /**
   * Remember a galaxy as the last-viewed (called on every switch). Applies
   * immediately in memory; persistence is best-effort.
   */
  readonly rememberGalaxy: (galaxyId: GalaxyId) => void;
}

/**
 * The last-viewed galaxy (PRD 27), parallel to `useSessionDuration`: one
 * additive key in the existing `settings` store (no new store, no
 * `localStorage`). Reads the persisted id once on mount; `page.tsx` resolves it
 * against the universe via the pure `resolveStoredGalaxyId` and persists a new
 * value on every galaxy switch. Which sky is open is a durable UI *preference*
 * — never a fact stored in the universe record.
 */
export function useCurrentGalaxy(): CurrentGalaxyState {
  const [storedGalaxyId, setStoredGalaxyId] = useState<string | undefined>(
    undefined,
  );
  const [galaxyLoaded, setGalaxyLoaded] = useState(false);

  // Load the persisted last-viewed id once. The setState runs after the await;
  // failure is non-fatal — `galaxyLoaded` still flips so the app proceeds on
  // the first-galaxy fallback. SSR-safe (the read no-ops until IndexedDB is
  // reachable client-side).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await getSetting(SETTINGS_KEYS.lastViewedGalaxyId);
        if (!cancelled) setStoredGalaxyId(stored);
      } catch {
        // Ignore — a missing/failed value falls back to the first galaxy.
      } finally {
        if (!cancelled) setGalaxyLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rememberGalaxy = useCallback((galaxyId: GalaxyId) => {
    // Apply immediately (in-memory) so the resolution follows the switch;
    // persist in the background. A persistence failure leaves the switch
    // applied for this session — best-effort, never blocking it.
    setStoredGalaxyId(galaxyId);
    void setSetting(SETTINGS_KEYS.lastViewedGalaxyId, galaxyId).catch(() => {
      /* best-effort persistence */
    });
  }, []);

  return { storedGalaxyId, galaxyLoaded, rememberGalaxy };
}
