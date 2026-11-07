import type { CURRENT_SCHEMA_VERSION } from "./constants";

/** ISO-8601 datetime string (e.g., '2026-05-22T14:30:00.000Z'). */
export type ISODateString = string & { readonly __isoDate: unique symbol };

/** Helper to create branded entity IDs at the type level. */
type Branded<K, T> = K & { readonly __brand: T };

export type UniverseId = Branded<string, "UniverseId">;
export type GalaxyId = Branded<string, "GalaxyId">;
export type StarId = Branded<string, "StarId">;
export type PlanetId = Branded<string, "PlanetId">;
export type MoonId = Branded<string, "MoonId">;
export type SessionId = Branded<string, "SessionId">;

/** A Pomodoro focus session — attached to a Planet or a Moon. */
export type Session = {
  readonly id: SessionId;
  readonly targetType: "planet" | "moon";
  readonly targetId: PlanetId | MoonId;
  readonly startedAt: ISODateString;
  readonly completedAt: ISODateString | null;
  readonly durationMs: number;
  readonly status: "in-progress" | "completed" | "abandoned";
};

/** Orbit state for a Planet or Moon — integer orbits + continuous progress. */
export type OrbitState = {
  readonly orbitsCompleted: number; // non-negative integer
  readonly currentOrbitProgress: number; // 0 ≤ x < 1
};

/** A Moon — a meta-skill orbiting a specific Planet. */
export type Moon = {
  readonly id: MoonId;
  readonly planetId: PlanetId;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: ISODateString;
  readonly orbit: OrbitState;
  readonly sessions: ReadonlyArray<Session>;
  readonly lastSessionAt: ISODateString | null;
};

/** A Planet — a deliberate practice attached to a Star. */
export type Planet = {
  readonly id: PlanetId;
  readonly starId: StarId;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: ISODateString;
  readonly orbit: OrbitState;
  readonly sessions: ReadonlyArray<Session>;
  readonly moons: ReadonlyArray<Moon>;
  readonly lastSessionAt: ISODateString | null;
};

/** A Star — a pursuit. Has no sessions of its own; gathers from its planets. */
export type Star = {
  readonly id: StarId;
  readonly galaxyId: GalaxyId;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: ISODateString;
  readonly planets: ReadonlyArray<Planet>;
};

/** A Galaxy — in V1, exactly one per Universe. */
export type Galaxy = {
  readonly id: GalaxyId;
  readonly universeId: UniverseId;
  readonly name: string;
  readonly createdAt: ISODateString;
  readonly stars: ReadonlyArray<Star>;
};

/** The top-level Universe. Schema-versioned for future migrations. */
export type Universe = {
  readonly id: UniverseId;
  readonly schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  readonly createdAt: ISODateString;
  readonly lastModified: ISODateString;
  readonly galaxies: ReadonlyArray<Galaxy>;
};

/** A 0-1 normalized value representing brightness (0 = cool/dim, 1 = warm/bright). */
export type Brightness = number & { readonly __brightness: unique symbol };

/** A non-negative size value in unitless world space. */
export type Size = number & { readonly __size: unique symbol };
