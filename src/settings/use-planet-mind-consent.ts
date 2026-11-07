"use client";

import { useCallback, useEffect, useState } from "react";

import { getSetting, setSetting, SETTINGS_KEYS } from "@/persistence";

import { isPlanetConsented, withPlanetConsent } from "./planet-mind-consent";

export interface PlanetMindConsentState {
  /**
   * Whether this planet's mind may read its notes (PRD 34). Default **off** —
   * resolves through the pure `isPlanetConsented`, so an unresolved/missing/
   * malformed store reads as off for every planet (no note is ever read on a
   * guess).
   */
  readonly isConsented: (planetId: string) => boolean;
  /**
   * Turn a planet's consent on or off. Applies immediately in memory (so the
   * panel reacts at once) and persists best-effort. Off **removes** the id —
   * revoking leaves nothing residual.
   */
  readonly setConsent: (planetId: string, on: boolean) => void;
}

/**
 * Per-planet mind-read consent (PRD 34), parallel to `useAnthropicKey`: one
 * additive key in the existing `settings` store (no new store, no
 * `localStorage`), holding a JSON map. Lifted ONCE in `page.tsx` so the
 * planet-mind panel reads a single source of truth. The raw map is held in
 * memory; the pure `isPlanetConsented` / `withPlanetConsent` do the resolution.
 *
 * Consent is the gate the read-sandbox opens by (PRD 34): a planet whose
 * consent is off never has a note read — and that check lives in the read path
 * (`readConsentedPlanetNotes`), this hook only carries the flag.
 */
export function usePlanetMindConsent(): PlanetMindConsentState {
  // The raw stored JSON map (undefined until resolved / never set). Re-resolved
  // through the pure helper on every read, so an unresolved store is simply
  // "everyone off" — the safe default.
  const [raw, setRaw] = useState<string | undefined>(undefined);

  // Load the persisted map once. Failure is non-fatal — it stays undefined,
  // which the pure helper reads as "all off". SSR-safe (no-ops until IndexedDB
  // is reachable client-side).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await getSetting(SETTINGS_KEYS.planetMindConsent);
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
    (planetId: string) => isPlanetConsented(raw, planetId),
    [raw],
  );

  const setConsent = useCallback((planetId: string, on: boolean) => {
    // Toggle off the freshest map (functional update) so concurrent toggles
    // across planets can't clobber each other; apply immediately, persist in
    // the background (best-effort, like every settings write).
    setRaw((current) => {
      const next = withPlanetConsent(current, planetId, on);
      void setSetting(SETTINGS_KEYS.planetMindConsent, next).catch(() => {
        /* best-effort persistence — the choice still holds this session */
      });
      return next;
    });
  }, []);

  return { isConsented, setConsent };
}
