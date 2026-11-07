import path from "node:path";

import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/universe/**",
        "src/persistence/**",
        // Pure ambient-motion math (PRD 5). Only the .ts utility is included,
        // not the whole observatory dir — the .tsx render components are
        // verified visually (headless screenshot), not unit-tested.
        "src/components/observatory/motion.ts",
        // Pure star-rendering math (PRD 6): seeded per-ID position. Same rule
        // — only the .ts utilities, not the .tsx render components.
        "src/components/observatory/stars/position.ts",
        // Shared brightness→color helper (PRD 7; moved up from stars/color.ts).
        // Used by both stars and planets. The in-place `applyBodyColor` variant
        // (growth-swell polish) is the per-frame-safe form, also covered here.
        "src/components/observatory/body-color.ts",
        // Pure display-ease helper (growth-swell polish): the frame-rate-
        // independent damp toward a computed target with the reduced-motion snap
        // folded in (the third sibling of easeAngle/dampTo). Drives the eased
        // brightness/size/corona; the .tsx wiring is verified by the temporal check.
        "src/components/observatory/display-ease.ts",
        // Pure clearance-aware layout math (PRD 23): hierarchical annulus
        // packing (moon shells clear the planet; planet shells clear the star +
        // neighbours, footprints include moons) + the systemExtent the camera
        // tracks. The heavily-tested geometry core; the .tsx wiring (eased radius
        // breathe) is verified headless. Supersedes the old index-based
        // planets/position.ts spacing (removed).
        "src/components/observatory/layout.ts",
        // Pure accretion math (PRD 26 — the black hole): the galaxy's total
        // focused minutes (a pure read of the persisted planet + moon sessions)
        // and the asymptotic presence curve. Only the .ts helper — the
        // BlackHole.tsx body (eased presence, gated spin, raycast-transparent)
        // is verified headless + by eye (§11).
        "src/components/observatory/center/accretion.ts",
        // Pure toroidal-wrap math (PRD 31 — the endless dust): the 1-D torus
        // wrap that keeps the mote field centered on the camera's pan, plus
        // the wrap-box-size constants whose no-pop inequality is locked
        // against MAX_ZOOM. Only the .ts helper — the DustMotes.tsx loop
        // (wrap always, drift gated) is verified headless + by eye (§11).
        "src/components/observatory/atmosphere/wrap.ts",
        // Pure orbit-glide math (PRD 8): progress→angle, forward-arc target
        // (incl. wrap), frame-rate-independent ease. Lifted to the observatory
        // level in PRD 12 (shared by planets + moons, like body-color.ts — §9.1).
        "src/components/observatory/orbit-animation.ts",
        // Pure camera-control math (PRD 13): zoom/pan clamping, pixel→world pan
        // delta, cursor-centered zoom, the generic exponential damp, and the
        // idle-factor gate/ease. Only the .ts helpers — the Camera.tsx driver
        // (native listeners + composing useFrame) is verified visually (§11).
        "src/components/observatory/camera-controls.ts",
        // Pure adaptive-DPR math (PRD 14): the live FPS sampler (warm-up,
        // rolling window, outlier rejection), the sustained-slow decision
        // helper, and the DPR step/floor lever. Only the .ts helper — the
        // PerfGovernor.tsx driver (the useFrame wiring + DPR application) is
        // verified by the perf-instrumentation check (§11), not unit tests.
        "src/components/observatory/perf.ts",
        // Pure create-a-Star name validation (PRD 9). Only the .ts helper is
        // included; the .tsx overlay components are verified visually (§12).
        "src/components/ui/validation.ts",
        // Pure focus-session timer math (PRD 11): timestamp-backed
        // elapsed/remaining/complete + MM:SS formatting. Same rule — only the
        // .ts helper is unit-tested; the .tsx focus overlay is verified visually.
        "src/components/ui/focus-timer.ts",
        // Pure star-catalog filtering (PRD 25): case-insensitive substring over
        // star + practice names → which stars appear and which practices show
        // beneath each. Same rule — only the .ts helper; the StarCatalog.tsx
        // panel + the navigate/glide composition are verified headless + by eye.
        "src/components/ui/catalog.ts",
        // Pure reduced-motion resolution (PRD 15): OS query + override → resolved
        // boolean, and the loaded-value type guard. Only the .ts logic is
        // unit-tested; the hook + the settings overlay are verified at runtime.
        "src/settings/motion-preference.ts",
        // Pure current-galaxy resolution (PRD 27): the stored last-viewed id
        // resolved against the universe's real galaxies, with the first-galaxy
        // fallback. Same rule — only the .ts logic; the hook + the galaxy
        // switcher are verified headless + by eye.
        "src/settings/current-galaxy.ts",
        // Pure per-planet mind-read consent (PRD 34 — the planet mind): default
        // off, set-on, revoke-removes, malformed→off, per-planet isolation. Only
        // the .ts logic; the hook + the panel are verified headless + by eye.
        "src/settings/planet-mind-consent.ts",
        // The mind (PRD 28 — the fog distiller): the pure request builder +
        // tolerant parser (distill.ts) and the thin injectable-fetch client
        // (client.ts, tested through injection — the real API is never
        // called). Structurally sandboxed: src/mind/ imports nothing from
        // @/universe or @/persistence. The CenterPanel.tsx wiring is verified
        // headless + by eye.
        "src/mind/distill.ts",
        "src/mind/client.ts",
        // The consented read door (PRD 34 — the planet mind): the ONE audited
        // path by which a note reaches the mind — consent-gated (off → loadPage
        // never called), scoped to exactly one planet's own page, read-only.
        // Injectable deps are the verification seam (the bridge .ts is the only
        // place that reads @/persistence pages for the mind; the PlanetMindPanel
        // wiring is verified headless + by eye).
        "src/mind-bridge/read-notes.ts",
      ],
      // The useUniverse / usePage hooks are React-dependent; their tests need
      // @testing-library/react + jsdom and are deferred to a follow-up PRD. The
      // pages.ts seam usePage wraps is fully unit-tested. Exclude them so the
      // ≥85% gate measures the Node-testable persistence core.
      exclude: [
        ...coverageConfigDefaults.exclude,
        "src/persistence/use-universe.ts",
        "src/persistence/use-page.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
