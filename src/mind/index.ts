/**
 * Eclipse Brain OS — the mind module (PRD 28, the fog distiller; PRD 33, the
 * conversational fog).
 *
 * THE CONSTITUTION, STRUCTURALLY: nothing under `src/mind/` imports from
 * `@/universe` or `@/persistence` (asserted by `boundary.test.ts`). The mind
 * takes strings and returns strings — there is no code path from here to the
 * model, the record, or anything earned. It reads and offers; the HUMAN creates
 * (through the existing prefilled create form → `handleCreateStar`). See
 * `decisions-log.md` (PRD 26's locked galaxy-mind principles; PRD 28's
 * enactment; PRD 33's conversation).
 *
 * `distill.ts` is the pure surface (the two-mode request builders + tolerant
 * parsers + the constitution-encoding system-prompt family + the turn-cap /
 * transcript-assembly helpers); `client.ts` is the thin network seam (injectable
 * fetch, one call per turn, no retries, safe errors).
 */

export {
  ANTHROPIC_MESSAGES_URL,
  applyProposal,
  buildConverseRequest,
  buildDistillMessages,
  buildDistillRequest,
  buildPlanetConverseRequest,
  buildPlanetProposalRequest,
  buildReflectionRequest,
  conversationAtCap,
  CONVERSE_MAX_TOKENS,
  CONVERSE_SYSTEM_PROMPT,
  DISTILL_REQUEST_CUE,
  DISTILLER_MAX_TOKENS,
  DISTILLER_MODEL,
  DISTILLER_SYSTEM_PROMPT,
  MAX_CONVERSATION_TURNS,
  mindTurnCount,
  buildStarConverseRequest,
  buildStarProposalRequest,
  buildStarReflectionRequest,
  parseConverseResponse,
  parseDistillResponse,
  parsePlanetProposalResponse,
  parseReflectionResponse,
  parseStarProposalResponse,
  PLANET_CONVERSE_SYSTEM_PROMPT,
  PLANET_PROPOSAL_SYSTEM_PROMPT,
  REFLECTION_MAX_TOKENS,
  REFLECTION_REQUEST_CUE,
  REFLECTION_SYSTEM_PROMPT,
  STAR_CONVERSE_SYSTEM_PROMPT,
  STAR_PROPOSAL_SYSTEM_PROMPT,
  STAR_REFLECTION_REQUEST_CUE,
  STAR_REFLECTION_SYSTEM_PROMPT,
  type Distillation,
  type MindMessage,
  type MindRequest,
  type PlanetNoteProposal,
  type ProposalKind,
  type StarNoteProposal,
  type StarSubtreeNote,
} from "./distill";
export {
  converse,
  DistillError,
  distillFog,
  planetConverse,
  planetPropose,
  reflect,
  starConverse,
  starPropose,
  starReflect,
  type DistillCallOptions,
} from "./client";
