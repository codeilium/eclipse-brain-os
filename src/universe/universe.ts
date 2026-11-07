import { applyPomodoroToMoon, applyPomodoroToPlanet } from "./cascade";
import type {
  Galaxy,
  ISODateString,
  Moon,
  Planet,
  Session,
  Star,
  Universe,
} from "./types";

// ----- Query functions -----

export function findStarById(
  universe: Universe,
  starId: Star["id"],
): Star | null {
  for (const galaxy of universe.galaxies) {
    const star = galaxy.stars.find((s) => s.id === starId);
    if (star) return star;
  }
  return null;
}

export function findPlanetById(
  universe: Universe,
  planetId: Planet["id"],
): { planet: Planet; star: Star; galaxy: Galaxy } | null {
  for (const galaxy of universe.galaxies) {
    for (const star of galaxy.stars) {
      const planet = star.planets.find((p) => p.id === planetId);
      if (planet) return { planet, star, galaxy };
    }
  }
  return null;
}

export function findMoonById(
  universe: Universe,
  moonId: Moon["id"],
): { moon: Moon; planet: Planet; star: Star; galaxy: Galaxy } | null {
  for (const galaxy of universe.galaxies) {
    for (const star of galaxy.stars) {
      for (const planet of star.planets) {
        const moon = planet.moons.find((m) => m.id === moonId);
        if (moon) return { moon, planet, star, galaxy };
      }
    }
  }
  return null;
}

// ----- Mutation functions (return new Universe, never mutate) -----

export function addGalaxyToUniverse(universe: Universe, galaxy: Galaxy): Universe {
  return {
    ...universe,
    galaxies: [...universe.galaxies, galaxy],
    lastModified: nowISO(),
  };
}

export function addStarToUniverse(universe: Universe, star: Star): Universe {
  const galaxies = universe.galaxies.map((g) =>
    g.id === star.galaxyId ? { ...g, stars: [...g.stars, star] } : g,
  );
  return { ...universe, galaxies, lastModified: nowISO() };
}

export function addPlanetToUniverse(
  universe: Universe,
  planet: Planet,
): Universe {
  const galaxies = universe.galaxies.map((galaxy) => ({
    ...galaxy,
    stars: galaxy.stars.map((star) =>
      star.id === planet.starId
        ? { ...star, planets: [...star.planets, planet] }
        : star,
    ),
  }));
  return { ...universe, galaxies, lastModified: nowISO() };
}

export function addMoonToUniverse(universe: Universe, moon: Moon): Universe {
  const galaxies = universe.galaxies.map((galaxy) => ({
    ...galaxy,
    stars: galaxy.stars.map((star) => ({
      ...star,
      planets: star.planets.map((planet) =>
        planet.id === moon.planetId
          ? { ...planet, moons: [...planet.moons, moon] }
          : planet,
      ),
    })),
  }));
  return { ...universe, galaxies, lastModified: nowISO() };
}

// ----- Edit & delete mutators (PRD 16) — return new Universe, never mutate -----

/**
 * The only fields an edit may touch: a body's name and its optional description.
 *
 * This type is the structural enforcement of the honest-universe principle
 * (`r3f-conventions.md` §2): an edit fixes a *label*, never *earned* state. There
 * is deliberately no field here for sessions, orbits, brightness, size, corona,
 * timestamps, ids, or children — so no code path (and therefore no UI) can reach
 * them through an edit. The sky always reflects real work; you can rename a
 * pursuit, never fake its growth.
 */
export type BodyDetails = {
  readonly name: string;
  readonly description: string | null;
};

/**
 * The only field a galaxy edit may touch: its name. A galaxy stores no
 * description (PRD 27 — never add a field, never collect what isn't stored),
 * so this is the `BodyDetails` idea narrowed to what the `Galaxy` type
 * actually declares. Label-only by construction: there is no path through
 * this type to a galaxy's stars or anything they have earned.
 */
export type GalaxyDetails = {
  readonly name: string;
};

/** Descendant counts for a body — drives the honest delete confirmation. */
export type SubtreeCounts = {
  readonly planets: number;
  readonly moons: number;
};

/**
 * Rename / re-describe a star (its name + description only — see `BodyDetails`).
 * Everything else (id, galaxyId, createdAt, planets) is preserved by reference.
 * An empty/whitespace name is a gentle no-op (mirrors the create form's
 * `isValidBodyName`); a missing id is a safe no-op. Both return the *same*
 * universe reference, untouched.
 */
export function editStarDetails(
  universe: Universe,
  starId: Star["id"],
  details: BodyDetails,
): Universe {
  if (details.name.trim().length === 0) return universe;
  if (!findStarById(universe, starId)) return universe;
  const galaxies = universe.galaxies.map((galaxy) => ({
    ...galaxy,
    stars: galaxy.stars.map((star) =>
      star.id === starId
        ? { ...star, name: details.name, description: details.description }
        : star,
    ),
  }));
  return { ...universe, galaxies, lastModified: nowISO() };
}

/**
 * Rename a galaxy (its name only — see `GalaxyDetails`; a galaxy stores no
 * description). Everything else (id, universeId, createdAt, stars) is preserved
 * by reference — the PRD 16 label-only invariant, extended to galaxies: you can
 * rename a sky, never fake what it holds. An empty/whitespace name is a gentle
 * no-op; a missing id is a safe no-op (both return the same universe reference).
 */
export function editGalaxyDetails(
  universe: Universe,
  galaxyId: Galaxy["id"],
  details: GalaxyDetails,
): Universe {
  if (details.name.trim().length === 0) return universe;
  if (!universe.galaxies.some((galaxy) => galaxy.id === galaxyId)) {
    return universe;
  }
  const galaxies = universe.galaxies.map((galaxy) =>
    galaxy.id === galaxyId ? { ...galaxy, name: details.name } : galaxy,
  );
  return { ...universe, galaxies, lastModified: nowISO() };
}

/** Rename / re-describe a planet (name + description only — see `editStarDetails`). */
export function editPlanetDetails(
  universe: Universe,
  planetId: Planet["id"],
  details: BodyDetails,
): Universe {
  if (details.name.trim().length === 0) return universe;
  if (!findPlanetById(universe, planetId)) return universe;
  const galaxies = universe.galaxies.map((galaxy) => ({
    ...galaxy,
    stars: galaxy.stars.map((star) => ({
      ...star,
      planets: star.planets.map((planet) =>
        planet.id === planetId
          ? { ...planet, name: details.name, description: details.description }
          : planet,
      ),
    })),
  }));
  return { ...universe, galaxies, lastModified: nowISO() };
}

/** Rename / re-describe a moon (name + description only — see `editStarDetails`). */
export function editMoonDetails(
  universe: Universe,
  moonId: Moon["id"],
  details: BodyDetails,
): Universe {
  if (details.name.trim().length === 0) return universe;
  if (!findMoonById(universe, moonId)) return universe;
  const galaxies = universe.galaxies.map((galaxy) => ({
    ...galaxy,
    stars: galaxy.stars.map((star) => ({
      ...star,
      planets: star.planets.map((planet) => ({
        ...planet,
        moons: planet.moons.map((moon) =>
          moon.id === moonId
            ? { ...moon, name: details.name, description: details.description }
            : moon,
        ),
      })),
    })),
  }));
  return { ...universe, galaxies, lastModified: nowISO() };
}

/**
 * Delete a star and its whole subtree (its planets and their moons go with it —
 * they are nested inside the star, so removing it cascades automatically). A
 * missing id is a safe no-op (returns the same universe reference, untouched).
 */
export function deleteStar(universe: Universe, starId: Star["id"]): Universe {
  if (!findStarById(universe, starId)) return universe;
  const galaxies = universe.galaxies.map((galaxy) => ({
    ...galaxy,
    stars: galaxy.stars.filter((star) => star.id !== starId),
  }));
  return { ...universe, galaxies, lastModified: nowISO() };
}

/** Delete a planet and its moons (nested → cascade is automatic). Missing id = no-op. */
export function deletePlanet(
  universe: Universe,
  planetId: Planet["id"],
): Universe {
  if (!findPlanetById(universe, planetId)) return universe;
  const galaxies = universe.galaxies.map((galaxy) => ({
    ...galaxy,
    stars: galaxy.stars.map((star) => ({
      ...star,
      planets: star.planets.filter((planet) => planet.id !== planetId),
    })),
  }));
  return { ...universe, galaxies, lastModified: nowISO() };
}

/** Delete a moon (a leaf — no subtree). Missing id = no-op. */
export function deleteMoon(universe: Universe, moonId: Moon["id"]): Universe {
  if (!findMoonById(universe, moonId)) return universe;
  const galaxies = universe.galaxies.map((galaxy) => ({
    ...galaxy,
    stars: galaxy.stars.map((star) => ({
      ...star,
      planets: star.planets.map((planet) => ({
        ...planet,
        moons: planet.moons.filter((moon) => moon.id !== moonId),
      })),
    })),
  }));
  return { ...universe, galaxies, lastModified: nowISO() };
}

/**
 * Count a body's descendants, so the delete confirmation can name the cascade
 * honestly ("…and its 3 practices and 5 sub-practices"). A star reports its
 * planets and the sum of their moons; a planet reports its moons; a moon (a
 * leaf) reports zero. Pure — takes the already-resolved body (callers have it
 * via `findStarById` / `findPlanetById` / `findMoonById`).
 */
export function describeSubtree(body: Star | Planet | Moon): SubtreeCounts {
  if ("planets" in body) {
    return {
      planets: body.planets.length,
      moons: body.planets.reduce((sum, planet) => sum + planet.moons.length, 0),
    };
  }
  if ("moons" in body) {
    return { planets: 0, moons: body.moons.length };
  }
  return { planets: 0, moons: 0 };
}

/**
 * Apply a completed Pomodoro session to the universe. The session has already
 * been started (and is currently 'in-progress' or 'completed' status). This
 * function:
 * - finds the target planet or moon
 * - applies the cascade (advance orbit, advance moons if planet, etc.)
 * - appends the (completed) session to the target's session list
 * - updates lastModified
 *
 * Returns a new Universe with all the changes.
 */
export function commitCompletedSession(
  universe: Universe,
  session: Session,
): Universe {
  if (session.status !== "completed") {
    throw new Error(
      `commitCompletedSession received a session with status '${session.status}'`,
    );
  }
  if (!session.completedAt) {
    throw new Error(
      "commitCompletedSession requires session.completedAt to be set",
    );
  }

  const galaxies = universe.galaxies.map((galaxy) => ({
    ...galaxy,
    stars: galaxy.stars.map((star) => ({
      ...star,
      planets: star.planets.map((planet) => {
        // Case 1: the session targets this exact planet
        if (session.targetType === "planet" && session.targetId === planet.id) {
          const cascaded = applyPomodoroToPlanet(
            planet,
            session.completedAt as string,
            session.durationMs,
          );
          return {
            ...cascaded,
            sessions: [...planet.sessions, session],
          };
        }
        // Case 2: the session targets a moon inside this planet
        if (session.targetType === "moon") {
          const moonIndex = planet.moons.findIndex(
            (m) => m.id === session.targetId,
          );
          if (moonIndex >= 0) {
            const moon = planet.moons[moonIndex]!;
            const cascadedMoon = applyPomodoroToMoon(
              moon,
              session.completedAt as string,
              session.durationMs,
            );
            const updatedMoon = {
              ...cascadedMoon,
              sessions: [...moon.sessions, session],
            };
            const newMoons = [...planet.moons];
            newMoons[moonIndex] = updatedMoon;
            return { ...planet, moons: newMoons };
          }
        }
        return planet;
      }),
    })),
  }));

  return { ...universe, galaxies, lastModified: nowISO() };
}

function nowISO(): ISODateString {
  return new Date().toISOString() as ISODateString;
}
