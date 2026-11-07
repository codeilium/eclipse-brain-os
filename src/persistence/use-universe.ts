"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createUniverse, type Universe } from "@/universe";

import { PersistenceError } from "./errors";
import { loadUniverse, saveUniverse } from "./repository";

export type UniverseState =
  | { status: "loading" }
  | { status: "ready"; universe: Universe; lastSavedAt: string | null }
  | { status: "error"; error: PersistenceError };

/**
 * React hook that loads the universe on mount (creating a fresh one if none
 * exists), exposes the current state, and provides an updater that auto-saves
 * to IndexedDB on every change.
 *
 * The updater accepts a function `(Universe) => Universe` so the caller always
 * derives from the freshest universe (avoids stale-closure race conditions).
 */
export function useUniverse(): {
  state: UniverseState;
  update: (updater: (u: Universe) => Universe) => Promise<void>;
} {
  const [state, setState] = useState<UniverseState>({ status: "loading" });
  const universeRef = useRef<Universe | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        let universe = await loadUniverse();
        if (universe === null) {
          universe = createUniverse();
          await saveUniverse(universe);
        }
        if (cancelled) return;
        universeRef.current = universe;
        setState({
          status: "ready",
          universe,
          lastSavedAt: universe.lastModified,
        });
      } catch (e) {
        if (cancelled) return;
        const error =
          e instanceof PersistenceError
            ? e
            : new PersistenceError("Unknown error during universe load", e);
        setState({ status: "error", error });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(async (updater: (u: Universe) => Universe) => {
    const current = universeRef.current;
    if (!current) return;
    const next = updater(current);
    universeRef.current = next;
    setState({ status: "ready", universe: next, lastSavedAt: next.lastModified });
    try {
      await saveUniverse(next);
    } catch (e) {
      const error =
        e instanceof PersistenceError
          ? e
          : new PersistenceError("Unknown error during save", e);
      setState({ status: "error", error });
    }
  }, []);

  return { state, update };
}
