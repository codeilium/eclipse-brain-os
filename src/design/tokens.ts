/**
 * Eclipse Brain OS — canonical design tokens.
 *
 * Single source of truth for token *values* that JavaScript needs directly:
 * three.js / R3F colors (hex strings), motion timings (ms) and easings
 * (cubic-bézier control points).
 *
 * The color + font values are mirrored into `src/app/globals.css` under
 * Tailwind v4's `@theme` block so Tailwind can generate utilities
 * (`bg-void`, `text-starlight`, `ease-cinematic`, …). When a color changes
 * here, update `@theme` to match. See `.claude/docs/eclipse-design-tokens.md`.
 */

/**
 * Deep-space palette — restrained and cinematic.
 * Never pure black (`#000`) or pure white (`#fff`); the universe always has
 * a faint blue undertone, and starlight is warm-neutral, not clinical.
 */
export const color = {
  void: "#04050a", // deepest background — the empty observatory
  abyss: "#080b14", // secondary surface / panels
  deepSpace: "#0c1322", // gradient mid-tone
  nebula: "#16233f", // dark-blue accent
  dusk: "#2a2342", // cool/dormant — neglected planets, distant haze, recessed depth. Never an active/lit element.
  amethyst: "#5b4b8a", // cool/dormant — neglected planets, distant haze, recessed depth. Never an active/lit element.
  corona: "#d9a566", // primary warm accent — active planets, stars, eclipse rim, focused-upon highlights
  crescent: "#f5ede0", // warm off-white — small lit elements, distant stars, restrained text accents
  starlight: "#e6e8f0", // primary "white" for text and bright bodies
  haze: "#9aa0b5", // dimmed text / secondary labels
} as const;

/**
 * Color-meaning map — the machine-readable form of the warm/cool rule.
 * Warm = active/present, cool = dormant/distant; the near-black void is the
 * medium both live in. Future PRDs (planet rendering, growth/brightness) read
 * this to derive a body's color from its state — a tended planet glows warm, a
 * neglected one dims cool. See `.claude/docs/eclipse-design-tokens.md`.
 */
export const colorRole = {
  active: [color.corona, color.crescent, color.starlight], // warm, lit, present
  dormant: [color.dusk, color.amethyst, color.nebula], // cool, distant, neglected
  medium: [color.void, color.abyss, color.deepSpace], // the void itself
  dimText: [color.haze], // dimmed UI labels
} as const;

/** Opacity veils for layering darkness over darkness (no hard edges). */
export const veil = {
  faint: 0.04,
  soft: 0.08,
  medium: 0.16,
  strong: 0.32,
  heavy: 0.6,
} as const;

/** Motion durations in milliseconds. */
export const duration = {
  instant: 120,
  quick: 200, // UI hover / small state changes
  base: 400,
  slow: 800, // fades and reveals
  cinematic: 1200, // planet growth, major reveals
  drift: 48000, // ambient camera/orbit drift loop length (not a transition)
} as const;

/**
 * Cubic-bézier easing control points `[x1, y1, x2, y2]`.
 * Consumable directly by `motion` and usable to build CSS `cubic-bezier(...)`.
 */
export const easing = {
  cinematic: [0.16, 1, 0.3, 1], // slow, confident settle
  drift: [0.45, 0, 0.55, 1], // smooth sine in-out for ambient motion
  soft: [0.4, 0, 0.2, 1], // UI default
} as const;

/** Convert milliseconds to seconds (three.js / motion often want seconds). */
export const toSeconds = (ms: number): number => ms / 1000;

export type ColorToken = keyof typeof color;
