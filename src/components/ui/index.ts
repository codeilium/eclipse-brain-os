/**
 * Eclipse Brain OS — DOM overlay UI module.
 *
 * The home for all DOM overlay components, layered *over* the Observatory
 * canvas in `page.tsx` — never inside it. The canvas stays props-only; UI reads
 * universe state via `useUniverse()` and mutates through the locked `@/universe`
 * mutators, persisting via `useUniverse().update`. Conventions are locked in
 * `.claude/docs/r3f-conventions.md` §12.
 *
 * The barrel exports only what `page.tsx` mounts; the shared `CreateBodyForm`
 * and the pure `isValidBodyName` helper are internal to the module.
 */

export { Onboarding } from "./Onboarding";
export { NewPursuitButton } from "./NewPursuitButton";
export { GalaxySwitcher } from "./GalaxySwitcher";
export { StarContext } from "./StarContext";
export { StarCatalog } from "./StarCatalog";
export { CenterPanel } from "./CenterPanel";
export { PlanetMindPanel } from "./PlanetMindPanel";
export { StarMindPanel } from "./StarMindPanel";
export { PageDock } from "./PageDock";
export { FocusSession } from "./FocusSession";
export { InSessionNotes } from "./InSessionNotes";
export { ResetViewButton } from "./ResetViewButton";
export { SettingsButton } from "./SettingsButton";
export { Wordmark } from "./Wordmark";
