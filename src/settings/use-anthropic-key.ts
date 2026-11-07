"use client";

import { useCallback, useEffect, useState } from "react";

import { deleteSetting, getSetting, setSetting, SETTINGS_KEYS } from "@/persistence";

export interface AnthropicKeyState {
  /**
   * The stored key, or `undefined` when none is set (or it hasn't resolved
   * yet). Held in memory for the call path ONLY — consumers may pass it to
   * `distillFog` but must never render, log, or echo it (the settings
   * fieldset shows "a key is set", never the value).
   */
  readonly apiKey: string | undefined;
  /** True once the persisted value has resolved (or failed — then: no key). */
  readonly keyLoaded: boolean;
  /**
   * Save a (trimmed, non-empty) key. Applies immediately in memory;
   * persistence is best-effort, like every settings write.
   */
  readonly saveKey: (key: string) => void;
  /** Forget the key — a true delete from the settings store, nothing residual. */
  readonly clearKey: () => void;
}

/**
 * The person's own Anthropic API key (PRD 28), parallel to `useCurrentGalaxy`:
 * one additive key in the existing `settings` store (no new store, no
 * `localStorage`). Lifted ONCE in `page.tsx` so the settings fieldset
 * (save/clear) and the center panel (the call) share a single source of truth
 * — two hook instances would go stale against each other.
 *
 * The key is never displayed back, never logged, never placed in the DOM
 * after save — that contract lives with the consumers and is verified by the
 * PRD 28 sweep; this hook just carries the string.
 */
export function useAnthropicKey(): AnthropicKeyState {
  const [apiKey, setApiKey] = useState<string | undefined>(undefined);
  const [keyLoaded, setKeyLoaded] = useState(false);

  // Load the persisted key once. Failure is non-fatal — `keyLoaded` still
  // flips and the app proceeds keyless (the panel's gentle no-key state).
  // SSR-safe (the read no-ops until IndexedDB is reachable client-side).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await getSetting(SETTINGS_KEYS.anthropicApiKey);
        if (!cancelled && stored !== undefined && stored !== "") {
          setApiKey(stored);
        }
      } catch {
        // Ignore — a missing/failed read means "no key".
      } finally {
        if (!cancelled) setKeyLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveKey = useCallback((key: string) => {
    const trimmed = key.trim();
    if (trimmed === "") return; // a gentle no-op — clearing is its own action
    setApiKey(trimmed);
    void setSetting(SETTINGS_KEYS.anthropicApiKey, trimmed).catch(() => {
      /* best-effort persistence — the key still works this session */
    });
  }, []);

  const clearKey = useCallback(() => {
    setApiKey(undefined);
    void deleteSetting(SETTINGS_KEYS.anthropicApiKey).catch(() => {
      /* best-effort — at worst the key resurfaces next load; clear again */
    });
  }, []);

  return { apiKey, keyLoaded, saveKey, clearKey };
}
