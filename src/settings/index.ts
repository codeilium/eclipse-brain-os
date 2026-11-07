/**
 * Eclipse Brain OS — app settings module (PRD 15).
 *
 * Durable *UI preferences* (distinct from universe data): the reduced-motion
 * preference (PRD 15) and the last-used focus-session length (PRD 21); the
 * deferred quality toggle tomorrow. Pure resolution logic lives in
 * `motion-preference.ts` / `session-duration.ts`; the live hooks
 * (`use-motion-preference.ts`, `use-session-duration.ts`) read + persist via the
 * `settings` store. Persistence is IndexedDB via `@/persistence` (no
 * `localStorage`). Consumed by `page.tsx` (the single place universe + preference
 * state enters the tree) and the overlays in `src/components/ui/`.
 */

export {
  DEFAULT_MOTION_PREFERENCE,
  isMotionPreference,
  resolveReducedMotion,
  type MotionPreference,
} from "./motion-preference";
export {
  useMotionPreference,
  type MotionPreferenceState,
} from "./use-motion-preference";
export {
  clampSessionMinutes,
  DEFAULT_SESSION_DURATION_MS,
  MAX_SESSION_MINUTES,
  MIN_SESSION_MINUTES,
  minutesToMs,
  msToMinutes,
  parseSessionMinutes,
  resolveStoredDurationMs,
} from "./session-duration";
export {
  useSessionDuration,
  type SessionDurationState,
} from "./use-session-duration";
export { resolveStoredGalaxyId } from "./current-galaxy";
export {
  useCurrentGalaxy,
  type CurrentGalaxyState,
} from "./use-current-galaxy";
export {
  useAnthropicKey,
  type AnthropicKeyState,
} from "./use-anthropic-key";
export { isPlanetConsented, withPlanetConsent } from "./planet-mind-consent";
export {
  usePlanetMindConsent,
  type PlanetMindConsentState,
} from "./use-planet-mind-consent";
export { isStarConsented, withStarConsent } from "./star-mind-consent";
export {
  useStarMindConsent,
  type StarMindConsentState,
} from "./use-star-mind-consent";
