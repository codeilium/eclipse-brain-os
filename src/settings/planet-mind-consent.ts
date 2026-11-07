/**
 * Per-planet mind-read consent — the pure logic behind "this planet's mind may
 * read its notes" (PRD 34, the planet mind). The `planetMindConsent` settings
 * key holds a JSON map `{ [planetId]: true }`; this resolves a stored raw value
 * into a per-planet boolean and serializes a toggle, with no React / DOM /
 * persistence so every branch is unit-testable. The live wiring — reading +
 * persisting the key — lives in `use-planet-mind-consent.ts`; `page.tsx` owns
 * the lifted state.
 *
 * The constitution's gate (PRD 34): a planet whose consent is **off** (the
 * default — an absent id, an empty/malformed value, or `false`) never has one
 * note read or sent. Consent is a durable UI preference, never a property of
 * the universe tree — the record has no notion of "may read".
 */

/**
 * Whether THIS planet's mind may read its notes. The default is **off**: a
 * missing/empty/malformed raw value, an absent id, or any non-`true` entry all
 * resolve to `false`. Only an explicit `true` for this exact id is consent
 * (per-planet — one planet's flag never speaks for another's).
 */
export function isPlanetConsented(
  raw: string | undefined,
  planetId: string,
): boolean {
  const map = parseConsentMap(raw);
  return map[planetId] === true;
}

/**
 * Serialize the consent map with `planetId` toggled. Turning consent **on**
 * sets the id to `true`; turning it **off** *removes* the id entirely (revoking
 * leaves nothing residual — the storage mirror of "no past read was kept").
 * Returns the JSON string to persist. Order-independent and idempotent: setting
 * an already-set value, or clearing an absent one, round-trips cleanly.
 */
export function withPlanetConsent(
  raw: string | undefined,
  planetId: string,
  on: boolean,
): string {
  const map = parseConsentMap(raw);
  if (on) {
    map[planetId] = true;
  } else {
    delete map[planetId];
  }
  return JSON.stringify(map);
}

/**
 * Parse the stored value into a plain `{ id: true }` map. Tolerant by design —
 * anything that isn't a JSON object of `true` flags (undefined, "", malformed
 * JSON, an array, a primitive, stray non-`true` values) degrades to an empty
 * map, i.e. everyone is off. Consent must NEVER be inferred from junk.
 */
function parseConsentMap(raw: string | undefined): Record<string, true> {
  if (raw === undefined || raw === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const out: Record<string, true> = {};
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === true) out[id] = true;
  }
  return out;
}
