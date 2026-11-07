import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * THE CONSTITUTION, STRUCTURALLY — the two-part guarantee (PRD 26/28/33, opened
 * by ONE consented door in PRD 34). Enforced by construction, not discipline:
 *
 *  PART A — the mind imports nothing earned. Everything under `src/mind/`
 *  imports NOTHING from `@/universe` or `@/persistence` (nor any relative path
 *  that reaches them). The mind takes strings of conversation/notes and returns
 *  strings; there is no code path from it to the record, the model, or anything
 *  earned. (Unchanged since PRD 33 — kept verbatim.)
 *
 *  PART B — the bridge reads notes ONLY via the consented path, and writes
 *  NOTHING. PRD 34 opens the PRD 26 read-sandbox by exactly one door: the thin
 *  `src/mind-bridge/` seam that reads a planet's own notes and hands plain
 *  strings into the mind. That seam (a) imports NOTHING from `@/universe` (no
 *  earned reads, no structure enumeration, no writes), and (b) from
 *  `@/persistence` imports ONLY read/consent accessors — `loadPage`,
 *  `getSetting`, `SETTINGS_KEYS` — and NEVER any write accessor (`savePage`,
 *  `deletePage`, `deletePages`, `setSetting`, `deleteSetting`, `saveUniverse`,
 *  `clearUniverse`, `useUniverse`). So the read wall opens read-only, by one
 *  door, and the write wall stays sealed — by construction.
 *
 * This is the constitution getting NARROWER and SHARPER, not weaker: PRD 33
 * asserted only Part A ("the mind imports nothing from `@/persistence`"); PRD 34
 * deliberately lets the BRIDGE read `@/persistence`, but only through the
 * audited consented path and only the read accessors. The test scans EVERY `.ts`
 * in both directories, so any future file added to either is covered
 * automatically.
 */

const MIND_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(MIND_DIR, "..");
const BRIDGE_DIR = join(SRC_DIR, "mind-bridge");
const UNIVERSE_DIR = join(SRC_DIR, "universe");
const PERSISTENCE_DIR = join(SRC_DIR, "persistence");

/** The ONLY `@/persistence` exports the bridge may import — reads + consent reads. */
const ALLOWED_PERSISTENCE_IMPORTS = new Set(["loadPage", "getSetting", "SETTINGS_KEYS"]);

/** Write accessors that must NEVER reach the bridge (a clear-message guard). */
const FORBIDDEN_WRITE_ACCESSORS = [
  "savePage",
  "deletePage",
  "deletePages",
  "setSetting",
  "deleteSetting",
  "saveUniverse",
  "clearUniverse",
  "useUniverse",
];

/** Every module specifier a source file imports (static, side-effect, dynamic, require). */
function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g, // import … from "x"  /  export … from "x"
    /\bimport\s+["']([^"']+)["']/g, // import "x"  (side-effect)
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, // import("x")  (dynamic)
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g, // require("x")
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      if (m[1] !== undefined) specs.push(m[1]);
    }
  }
  return specs;
}

/** Does an import specifier reach a given src/<dir> (alias or relative-from `base`)? */
function reachesDir(spec: string, base: string, dir: string, alias: string): boolean {
  if (new RegExp(`^@/${alias}(/|$)`).test(spec)) return true;
  if (spec.startsWith(".")) {
    const target = resolve(base, spec);
    if (target === dir || target.startsWith(dir + "/")) return true;
  }
  return false;
}

/** The named bindings a file imports from a specific module (handles `type` + `as`). */
function namedImportsFrom(source: string, moduleSpec: string): string[] {
  const escaped = moduleSpec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*["']${escaped}["']`,
    "g",
  );
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    for (const raw of (m[1] ?? "").split(",")) {
      const cleaned = raw.trim().replace(/^type\s+/, "");
      if (cleaned === "") continue;
      const name = cleaned.split(/\s+as\s+/)[0]!.trim();
      if (name !== "") names.push(name);
    }
  }
  return names;
}

const mindFiles = readdirSync(MIND_DIR).filter((f) => f.endsWith(".ts"));
const bridgeFiles = readdirSync(BRIDGE_DIR).filter((f) => f.endsWith(".ts"));

describe("Part A — src/mind/ imports nothing earned (the mind is text-in/text-out)", () => {
  it("is scanning the real module set", () => {
    expect(mindFiles).toContain("distill.ts");
    expect(mindFiles).toContain("client.ts");
    expect(mindFiles).toContain("index.ts");
    // A comment that NAMES @/universe (the file headers do) must not be a false
    // positive — only true import specifiers count, and those use quotes.
    expect(readFileSync(join(MIND_DIR, "distill.ts"), "utf8")).toContain("@/universe");
  });

  it.each(mindFiles)("%s imports nothing from @/universe or @/persistence", (file) => {
    const source = readFileSync(join(MIND_DIR, file), "utf8");
    const offending = importSpecifiers(source).filter(
      (spec) =>
        reachesDir(spec, MIND_DIR, UNIVERSE_DIR, "universe") ||
        reachesDir(spec, MIND_DIR, PERSISTENCE_DIR, "persistence"),
    );
    expect(offending).toEqual([]);
  });
});

describe("Part B — src/mind-bridge/ reads ONLY via the consented path, writes nothing", () => {
  it("is scanning the real bridge module set", () => {
    expect(bridgeFiles).toContain("read-notes.ts");
    expect(bridgeFiles).toContain("index.ts");
  });

  it.each(bridgeFiles)("%s imports nothing from @/universe (no earned reads/writes)", (file) => {
    const source = readFileSync(join(BRIDGE_DIR, file), "utf8");
    const offending = importSpecifiers(source).filter((spec) =>
      reachesDir(spec, BRIDGE_DIR, UNIVERSE_DIR, "universe"),
    );
    expect(offending).toEqual([]);
  });

  it.each(bridgeFiles)(
    "%s imports ONLY read/consent accessors from @/persistence (never a write accessor)",
    (file) => {
      const source = readFileSync(join(BRIDGE_DIR, file), "utf8");
      const imported = namedImportsFrom(source, "@/persistence");
      // Every @/persistence import is in the allowed read/consent set …
      const disallowed = imported.filter(
        (name) => !ALLOWED_PERSISTENCE_IMPORTS.has(name),
      );
      expect(disallowed).toEqual([]);
      // … and, explicitly, no write accessor (a clear failure message).
      for (const writeAccessor of FORBIDDEN_WRITE_ACCESSORS) {
        expect(imported).not.toContain(writeAccessor);
      }
    },
  );

  it("the consented read door exists and reads exactly one planet's own page", () => {
    const source = readFileSync(join(BRIDGE_DIR, "read-notes.ts"), "utf8");
    // The audited door is named, and the read it performs is loadPage (a single
    // body's page) — never a subtree walk or a wider store read.
    expect(source).toContain("readConsentedPlanetNotes");
    expect(namedImportsFrom(source, "@/persistence")).toContain("loadPage");
  });

  it("the star read door exists and reads pages via loadPage — never a @/universe import (PRD 36)", () => {
    const source = readFileSync(join(BRIDGE_DIR, "read-star-notes.ts"), "utf8");
    // The wider door is named, and it reads pages via `loadPage` (the same single
    // read accessor) — its subtree is resolved by an INJECTED accessor, NOT by
    // importing `@/universe`. So the read scope is "only this star's subtree" by
    // construction (the it.each scans above already pin: no @/universe import,
    // only read/consent persistence accessors, never a write accessor — widened
    // to cover this file automatically, a tightening not a loosening).
    expect(source).toContain("readConsentedStarNotes");
    expect(namedImportsFrom(source, "@/persistence")).toContain("loadPage");
    // The subtree comes from an injected `resolveSubtree`, never a @/universe reach.
    expect(source).toContain("resolveSubtree");
    expect(
      importSpecifiers(source).filter((spec) =>
        reachesDir(spec, BRIDGE_DIR, UNIVERSE_DIR, "universe"),
      ),
    ).toEqual([]);
  });
});
