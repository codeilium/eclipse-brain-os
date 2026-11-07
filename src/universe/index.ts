/**
 * Eclipse Brain OS — universe module public API.
 *
 * The canonical, dependency-free model of the universe: types, tunable
 * constants, pure math (growth / brightness / orbit), the Pomodoro cascade,
 * entity factories, and immutable universe-level operations. Downstream PRDs
 * (2 persistence, 3+ rendering, 9–12 interaction) import from `@/universe`.
 *
 * Nothing here touches React, the DOM, persistence, or rendering — it is pure
 * data + pure functions, fully unit-tested in isolation.
 */

export * from "./constants";
export * from "./types";
export * from "./math";
export * from "./cascade";
export * from "./factory";
export * from "./universe";
