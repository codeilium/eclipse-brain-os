/**
 * Eclipse Brain OS — persistence module public API.
 *
 * Local-first IndexedDB persistence layer for the universe model. Downstream
 * code imports from `@/persistence`. Save is automatic and immediate; load
 * validates; every failure is a typed `PersistenceError` subclass. The universe
 * model (`@/universe`) stays pure and unaware that this layer exists.
 *
 * Three stores coexist (all per-origin): the `universe` record, the `settings`
 * key→value preferences (PRD 15), and the `pages` store (PRD 17) — one
 * plain-markdown page per body, keyed by body id, external to the universe
 * record (`pages.ts`).
 */

export * from "./errors";
export { loadUniverse, saveUniverse, clearUniverse } from "./repository";
export { getSetting, setSetting, deleteSetting, SETTINGS_KEYS } from "./settings";
export { useUniverse, type UniverseState } from "./use-universe";
export {
  loadPage,
  savePage,
  deletePage,
  deletePages,
  type Page,
} from "./pages";
export { subtreeIds } from "./subtree-ids";
export { usePage, type PageState } from "./use-page";
