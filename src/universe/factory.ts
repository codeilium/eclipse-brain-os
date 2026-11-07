import { CURRENT_SCHEMA_VERSION } from "./constants";
import type {
  Galaxy,
  GalaxyId,
  ISODateString,
  Moon,
  MoonId,
  Planet,
  PlanetId,
  Session,
  SessionId,
  Star,
  StarId,
  Universe,
  UniverseId,
} from "./types";

/**
 * Generate a unique ID. Uses crypto.randomUUID() — available in modern browsers
 * and Node 24. The branded type tells the type system what kind of ID this is.
 */
function newId<T extends string>(): T {
  return crypto.randomUUID() as T;
}

/** Get the current time as an ISO-8601 string. */
function now(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

export function createUniverse(): Universe {
  const universeId = newId<UniverseId>();
  const timestamp = now();
  const galaxy = createGalaxy(universeId, "My Universe");
  return {
    id: universeId,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: timestamp,
    lastModified: timestamp,
    galaxies: [galaxy],
  };
}

export function createGalaxy(universeId: UniverseId, name: string): Galaxy {
  return {
    id: newId<GalaxyId>(),
    universeId,
    name,
    createdAt: now(),
    stars: [],
  };
}

export function createStar(
  galaxyId: GalaxyId,
  name: string,
  description: string | null = null,
): Star {
  return {
    id: newId<StarId>(),
    galaxyId,
    name,
    description,
    createdAt: now(),
    planets: [],
  };
}

export function createPlanet(
  starId: StarId,
  name: string,
  description: string | null = null,
): Planet {
  return {
    id: newId<PlanetId>(),
    starId,
    name,
    description,
    createdAt: now(),
    orbit: { orbitsCompleted: 0, currentOrbitProgress: 0 },
    sessions: [],
    moons: [],
    lastSessionAt: null,
  };
}

export function createMoon(
  planetId: PlanetId,
  name: string,
  description: string | null = null,
): Moon {
  return {
    id: newId<MoonId>(),
    planetId,
    name,
    description,
    createdAt: now(),
    orbit: { orbitsCompleted: 0, currentOrbitProgress: 0 },
    sessions: [],
    lastSessionAt: null,
  };
}

export function createSession(
  targetType: "planet" | "moon",
  targetId: Session["targetId"],
  durationMs: number,
): Session {
  return {
    id: newId<SessionId>(),
    targetType,
    targetId,
    startedAt: now(),
    completedAt: null,
    durationMs,
    status: "in-progress",
  };
}
