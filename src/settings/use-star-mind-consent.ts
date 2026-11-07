"use client";

import { useCallback, useEffect, useState } from "react";

import { getSetting, setSetting, SETTINGS_KEYS } from "@/persistence";

import { isStarConsented, withStarConsent } from "./star-mind-consent";

export interface StarMindConsentState {
  /**
   * Whether this star's mind may read its subtree's notes (PRD 36). Default
   * **off** — resolves through the pure `isStarConsented`, so an unresolved/
   * missing/malformed store reads as off for every star (no note is ever read on
   * a guess).
   */
  readonly isConsented: (starId: string) => boolean;
  /**
   * Turn a star's consent on or off. Applies immediately in memory (so the panel
   * reacts at once) and persists best-effort. Off **removes** the id — revoking
   * leaves nothing residual.
   */
  readonly setConsent: (starId: string, on: boolean) => void;
}

/**
 * Per-star mind-read consent (PRD 36), parallel to `usePlanetMindConsent`: one
 * additive key in the existing `settings` store (no new store, no
 * `localStorage`), holding a JSON map. Lifted ONCE in `page.tsx` so the
 * star-mind panel reads a single source of truth. The raw map is held in memory;
 * the pure `isStarConsented` / `withStarConsent` do the resolution.
 *
 * Consent is the gate the wider read-sandbox opens by (PRD 36): a star whose
 * consent is off never has a note read — and that check lives in the read path
 * (`readConsentedStarNotes`), this hook only carries the flag.
 */
export function useStarMindConsent(): StarMindConsentState {
  // The raw stored JSON map (undefined until resolved / never set). Re-resolved
  // through the pure helper on every read, so an unresolved store is simply
  // "every star off" — the safe default.
  const [raw, setRaw] = useState<string | undefined>(undefined);

  // Load the persisted map once. Failure is non-fatal — it stays undefined,
  // which the pure helper reads as "all off". SSR-safe (no-ops until IndexedDB
  // is reachable client-side).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await getSetting(SETTINGS_KEYS.starMindConsent);
        if (!cancelled) setRaw(stored);
      } catch {
        // Ignore — a missing/failed read means "all off", the safe default.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isConsented = useCallback(
    (starId: string) => isStarConsented(raw, starId),
    [raw],
  );

  const setConsent = useCallback((starId: string, on: boolean) => {
    // Toggle off the freshest map (functional update) so concurrent toggles
    // across stars can't clobber each other; apply immediately, persist in the
    // background (best-effort, like every settings write).
    setRaw((current) => {
      const next = withStarConsent(current, starId, on);
      void setSetting(SETTINGS_KEYS.starMindConsent, next).catch(() => {
        /* best-effort persistence — the choice still holds this session */
      });
      return next;
    });
  }, []);

  return { isConsented, setConsent };
}
