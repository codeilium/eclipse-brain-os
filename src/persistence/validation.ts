import { CURRENT_SCHEMA_VERSION, type Universe } from "@/universe";

import { CorruptDataError } from "./errors";

/**
 * Validate that `data` is a structurally well-formed Universe. Throws
 * `CorruptDataError` if it isn't, with a path pointing to the problem field.
 *
 * This is defensive: a stored record cannot be trusted (a user could hand-edit
 * the DB; an old build could have written a malformed record). Validation runs
 * on every load, AFTER migrations, against the current schema version.
 *
 * Validation is **structural, not semantic** — it checks that required fields
 * exist with the right types, not that values are within sensible bounds. The
 * universe model owns semantic invariants.
 */
export function validateUniverse(data: unknown): asserts data is Universe {
  if (typeof data !== "object" || data === null) {
    throw new CorruptDataError("Universe is not an object");
  }
  const u = data as Record<string, unknown>;

  // Schema version check.
  if (u.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new CorruptDataError(
      `Expected schemaVersion ${CURRENT_SCHEMA_VERSION}, got ${String(u.schemaVersion)}`,
      "schemaVersion",
    );
  }

  requireString(u, "id");
  requireString(u, "createdAt");
  requireString(u, "lastModified");
  requireArray(u, "galaxies");

  const galaxies = u.galaxies as unknown[];
  for (let gi = 0; gi < galaxies.length; gi++) {
    validateGalaxy(galaxies[gi], `galaxies[${gi}]`);
  }
}

function validateGalaxy(data: unknown, path: string): void {
  if (typeof data !== "object" || data === null) {
    throw new CorruptDataError(`${path} is not an object`, path);
  }
  const g = data as Record<string, unknown>;
  requireString(g, "id", path);
  requireString(g, "universeId", path);
  requireString(g, "name", path);
  requireString(g, "createdAt", path);
  requireArray(g, "stars", path);

  const stars = g.stars as unknown[];
  for (let si = 0; si < stars.length; si++) {
    validateStar(stars[si], `${path}.stars[${si}]`);
  }
}

function validateStar(data: unknown, path: string): void {
  if (typeof data !== "object" || data === null) {
    throw new CorruptDataError(`${path} is not an object`, path);
  }
  const s = data as Record<string, unknown>;
  requireString(s, "id", path);
  requireString(s, "galaxyId", path);
  requireString(s, "name", path);
  requireNullableString(s, "description", path);
  requireString(s, "createdAt", path);
  requireArray(s, "planets", path);

  const planets = s.planets as unknown[];
  for (let pi = 0; pi < planets.length; pi++) {
    validatePlanet(planets[pi], `${path}.planets[${pi}]`);
  }
}

function validatePlanet(data: unknown, path: string): void {
  if (typeof data !== "object" || data === null) {
    throw new CorruptDataError(`${path} is not an object`, path);
  }
  const p = data as Record<string, unknown>;
  requireString(p, "id", path);
  requireString(p, "starId", path);
  requireString(p, "name", path);
  requireNullableString(p, "description", path);
  requireString(p, "createdAt", path);
  validateOrbitState(p.orbit, `${path}.orbit`);
  requireArray(p, "sessions", path);
  requireArray(p, "moons", path);
  requireNullableString(p, "lastSessionAt", path);
  // Sessions and moons are not validated deeply here for V1 — the structural
  // shape is enough; semantic validation belongs in the universe layer.
}

function validateOrbitState(data: unknown, path: string): void {
  if (typeof data !== "object" || data === null) {
    throw new CorruptDataError(`${path} is not an object`, path);
  }
  const o = data as Record<string, unknown>;
  if (
    typeof o.orbitsCompleted !== "number" ||
    !Number.isInteger(o.orbitsCompleted) ||
    o.orbitsCompleted < 0
  ) {
    throw new CorruptDataError(
      `${path}.orbitsCompleted must be a non-negative integer`,
      `${path}.orbitsCompleted`,
    );
  }
  if (
    typeof o.currentOrbitProgress !== "number" ||
    o.currentOrbitProgress < 0 ||
    o.currentOrbitProgress >= 1
  ) {
    throw new CorruptDataError(
      `${path}.currentOrbitProgress must be in [0, 1)`,
      `${path}.currentOrbitProgress`,
    );
  }
}

// --- helpers ---

function requireString(obj: Record<string, unknown>, key: string, parentPath = ""): void {
  if (typeof obj[key] !== "string") {
    const path = parentPath ? `${parentPath}.${key}` : key;
    throw new CorruptDataError(`${path} must be a string`, path);
  }
}

function requireNullableString(
  obj: Record<string, unknown>,
  key: string,
  parentPath = "",
): void {
  if (obj[key] !== null && typeof obj[key] !== "string") {
    const path = parentPath ? `${parentPath}.${key}` : key;
    throw new CorruptDataError(`${path} must be a string or null`, path);
  }
}

function requireArray(obj: Record<string, unknown>, key: string, parentPath = ""): void {
  if (!Array.isArray(obj[key])) {
    const path = parentPath ? `${parentPath}.${key}` : key;
    throw new CorruptDataError(`${path} must be an array`, path);
  }
}
