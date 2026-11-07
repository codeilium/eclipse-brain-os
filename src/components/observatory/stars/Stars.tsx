"use client";

import { Fragment, useEffect, useState } from "react";

import type { Galaxy, StarId } from "@/universe";

import { Planets } from "../planets";
import { Star } from "./Star";
import { starPositionFromId } from "./position";

interface StarsProps {
  /** The rendered galaxy (PRD 27) — the current sky, resolved by `Scene`. */
  readonly galaxy: Galaxy;
  /** The selected star's id (down). Each star compares its own id to mark itself. */
  readonly selectedStarId: StarId | null;
  /** Reports a star click up to `page.tsx` (§12.6). */
  readonly onSelectStar: (id: StarId | null) => void;
}

/**
 * Render all stars in the rendered galaxy (PRD 27: the current sky — `Scene`
 * resolves which galaxy is on screen and passes it down, the same galaxy the
 * black hole consumes, so the heart and the stars always agree).
 *
 * Honest-universe principle: if the universe has no stars, this renders
 * nothing. No demo stars, no placeholders, no "create your first star"
 * prompts in the canvas — that's PRD 9's job, and it lives in the DOM
 * overlay, not in the 3D scene.
 *
 * The `nowMs` clock is computed once on mount and refreshed every 60s
 * (slow enough that brightness decay still feels "ambient" but fast
 * enough that an open tab eventually reflects the passage of time).
 * Re-renders on `nowMs` change cascade through to brightness recomputation
 * in each <Star> and <Planets>.
 *
 * Each star's position is computed once here (`starPositionFromId`) and passed
 * to both `<Star>` and `<Planets>`, so the star and its planets render around
 * the same point — a single source of truth for the system's location.
 */
export function Stars({ galaxy, selectedStarId, onSelectStar }: StarsProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    // Refresh nowMs every 60 seconds so brightness decay is reflected
    // without aggressive polling. Brightness decays on a 7-day half-life,
    // so per-minute updates are more than enough granularity.
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // The current sky's stars — per-galaxy since PRD 27.
  const stars = galaxy.stars;

  if (stars.length === 0) {
    return null; // honest universe: nothing to render
  }

  return (
    <>
      {stars.map((star) => {
        const position = starPositionFromId(star.id);
        return (
          <Fragment key={star.id}>
            <Star
              star={star}
              position={position}
              nowMs={nowMs}
              selected={star.id === selectedStarId}
              onSelectStar={onSelectStar}
            />
            <Planets star={star} parentPosition={position} nowMs={nowMs} />
          </Fragment>
        );
      })}
    </>
  );
}
