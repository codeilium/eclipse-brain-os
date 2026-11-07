/**
 * The mind's thin network client (PRD 28; conversational in PRD 33). One call
 * per explicit human action (a "send", or a "distill now"), no retries, no
 * background calls — nothing here fires on its own.
 *
 * Same structural constitution as `distill.ts`: this module imports nothing
 * from `@/universe` or `@/persistence` — it carries text to the API and text
 * back, and that is all it CAN do.
 *
 * The fetch is INJECTABLE (`fetchFn`, defaulting to `globalThis.fetch`): unit
 * tests and the headless harness mock at exactly this boundary, so the real
 * API is never called by any verification. An `AbortSignal` threads through
 * so closing the center panel aborts an in-flight call.
 *
 * Errors are mapped to SHORT SAFE MESSAGES. The API key and the raw
 * request/response bodies never appear in any thrown or displayed string —
 * the messages below are constants, by construction.
 */

import {
  buildConverseRequest,
  buildDistillRequest,
  buildPlanetConverseRequest,
  buildPlanetProposalRequest,
  buildReflectionRequest,
  buildStarConverseRequest,
  buildStarProposalRequest,
  buildStarReflectionRequest,
  parseConverseResponse,
  parseDistillResponse,
  parsePlanetProposalResponse,
  parseReflectionResponse,
  parseStarProposalResponse,
  type Distillation,
  type MindMessage,
  type MindRequest,
  type PlanetNoteProposal,
  type StarNoteProposal,
  type StarSubtreeNote,
} from "./distill";

/** A distillation failure carrying only a short, safe, displayable message. */
export class DistillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DistillError";
  }
}

export interface DistillCallOptions {
  /** The injectable fetch — the verification boundary. Defaults to the real one. */
  readonly fetchFn?: typeof fetch;
  /** Abort signal — closing the panel aborts the in-flight call. */
  readonly signal?: AbortSignal;
}

/**
 * Make ONE call to the mind: send the prebuilt request once, map failures to
 * safe messages, and return the joined response text. The single network seam
 * shared by both modes — one call per turn, no retries. A deliberate abort is
 * re-thrown as-is (name `"AbortError"`) so the caller can swallow it silently —
 * closing the panel is not an error. The key and raw bodies appear in no thrown
 * string (the messages are constants, by construction).
 */
async function callMind(
  request: MindRequest,
  options: DistillCallOptions,
): Promise<string> {
  const { fetchFn = globalThis.fetch, signal } = options;

  let response: Response;
  try {
    response = await fetchFn(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal,
    });
  } catch (e) {
    if (isAbortError(e)) throw e;
    // Network failure — the safe generic; never the underlying error (which
    // could echo the request).
    throw new DistillError("the call didn't go through");
  }

  if (!response.ok) {
    throw new DistillError(messageForStatus(response.status));
  }

  let text: string;
  try {
    text = extractResponseText(await response.json());
  } catch (e) {
    if (isAbortError(e)) throw e;
    throw new DistillError("the call didn't go through");
  }
  if (text.trim() === "") {
    // A 200 with no text is not an answer — say so plainly.
    throw new DistillError("the call didn't go through");
  }

  return text;
}

/**
 * One converse turn (PRD 33): send the conversation so far, return the mind's
 * short sharpening reply (plain text, tolerantly parsed). Not a distillation.
 */
export async function converse(
  messages: readonly MindMessage[],
  apiKey: string,
  options: DistillCallOptions = {},
): Promise<string> {
  const text = await callMind(buildConverseRequest(messages, apiKey), options);
  return parseConverseResponse(text);
}

/**
 * The distillation (PRD 28 shape, conversational in PRD 33): send the whole
 * transcript (which must end on a `user` turn — see `buildDistillMessages`),
 * return the strongest signal + at most one offer, parsed tolerantly.
 */
export async function distillFog(
  messages: readonly MindMessage[],
  apiKey: string,
  options: DistillCallOptions = {},
): Promise<Distillation> {
  const text = await callMind(buildDistillRequest(messages, apiKey), options);
  return parseDistillResponse(text);
}

/**
 * The planet mind's reflection (PRD 34): send ONE planet's own notes (as plain
 * text, in the system prompt) and return one honest noticing. One call, the
 * same safe-error path — the notes appear in no thrown/displayed string (the
 * client never echoes the request body). The notes reach here only through the
 * consented bridge read; the mind itself imports nothing earned.
 */
export async function reflect(
  notes: string,
  apiKey: string,
  options: DistillCallOptions = {},
): Promise<string> {
  const text = await callMind(buildReflectionRequest(notes, apiKey), options);
  return parseReflectionResponse(text);
}

/**
 * One planet-converse turn (PRD 34): the PRD 33 converse mode about THIS
 * practice, the notes seeded as system context. Returns the mind's short
 * sharpening reply (plain text). Not a distillation.
 */
export async function planetConverse(
  notes: string,
  messages: readonly MindMessage[],
  apiKey: string,
  options: DistillCallOptions = {},
): Promise<string> {
  const text = await callMind(
    buildPlanetConverseRequest(notes, messages, apiKey),
    options,
  );
  return parseConverseResponse(text);
}

/**
 * The planet-note proposal (PRD 35): the notes seeded as system context, the
 * whole transcript (ending on a `user` turn — see `buildDistillMessages`), and
 * the mind returns a proposed note change (a correction, an addition, or none),
 * parsed tolerantly. The proposal is TEXT — the panel renders it as a diff and
 * the HUMAN commits it in the editor. The mind writes nothing; the key AND the
 * notes appear in no thrown/displayed string (the client never echoes the body).
 */
export async function planetPropose(
  notes: string,
  messages: readonly MindMessage[],
  apiKey: string,
  options: DistillCallOptions = {},
): Promise<PlanetNoteProposal> {
  const text = await callMind(
    buildPlanetProposalRequest(notes, messages, apiKey),
    options,
  );
  return parsePlanetProposalResponse(text);
}

/**
 * The star mind's CROSS-PRACTICE reflection (PRD 36): send ONE star's whole
 * subtree (its own notes + each orbiting planet's, as a labeled
 * `StarSubtreeNote[]` in the system prompt) and return one honest noticing that
 * runs across the practices. One call, the same safe-error path — the notes
 * appear in no thrown/displayed string (the client never echoes the request
 * body). The notes reach here only through the consented bridge read; the mind
 * itself imports nothing earned.
 */
export async function starReflect(
  bodies: readonly StarSubtreeNote[],
  apiKey: string,
  options: DistillCallOptions = {},
): Promise<string> {
  const text = await callMind(buildStarReflectionRequest(bodies, apiKey), options);
  return parseReflectionResponse(text);
}

/**
 * One star-converse turn (PRD 36): the PRD 33 converse mode about the WHOLE star,
 * its whole subtree seeded as system context. Returns the mind's short
 * sharpening reply (plain text). Not a proposal.
 */
export async function starConverse(
  bodies: readonly StarSubtreeNote[],
  messages: readonly MindMessage[],
  apiKey: string,
  options: DistillCallOptions = {},
): Promise<string> {
  const text = await callMind(
    buildStarConverseRequest(bodies, messages, apiKey),
    options,
  );
  return parseConverseResponse(text);
}

/**
 * The star-note proposal (PRD 36): the whole subtree seeded as system context
 * (each note labeled with its id), the whole transcript (ending on a `user` turn
 * — see `buildDistillMessages`), and the mind returns a proposed note change that
 * NAMES which note it targets (a correction, an addition, or none), parsed
 * tolerantly + validated against this star's subtree (`parseStarProposalResponse`
 * degrades an unknown/invalid target to "none"). The proposal is TEXT — the panel
 * renders it as a diff under the target note's name and the HUMAN commits it in
 * that note's editor. The mind writes nothing; the key AND the raw notes appear
 * in no thrown/displayed string (the client never echoes the body).
 */
export async function starPropose(
  bodies: readonly StarSubtreeNote[],
  messages: readonly MindMessage[],
  apiKey: string,
  options: DistillCallOptions = {},
): Promise<StarNoteProposal> {
  const text = await callMind(
    buildStarProposalRequest(bodies, messages, apiKey),
    options,
  );
  return parseStarProposalResponse(text, bodies);
}

/**
 * Map an HTTP failure to its short safe message (PRD 28 §3.3). The 429 message
 * tells the person to **wait** before retrying (PRD 35.1): an immediate retry
 * after a rate limit just trips it again — a human-paced retry gives the limit
 * time to clear, which the old read→reflect auto-loop never did.
 */
function messageForStatus(status: number): string {
  if (status === 401) return "the key was not accepted";
  if (status === 429)
    return "too many requests just now — wait a few seconds and try again";
  return "the call didn't go through";
}

/** Join the text blocks of a Messages API response body. */
function extractResponseText(data: unknown): string {
  if (data === null || typeof data !== "object") return "";
  const content = (data as Record<string, unknown>).content;
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const block of content) {
    if (block === null || typeof block !== "object") continue;
    const record = block as Record<string, unknown>;
    if (record.type === "text" && typeof record.text === "string") {
      text += record.text;
    }
  }
  return text;
}

/**
 * A deliberate abort (the panel closed) — not a failure. Checked by name, not
 * `instanceof Error`: fetch abort surfaces as a `DOMException`, whose Error
 * inheritance varies across runtimes.
 */
function isAbortError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "name" in e &&
    (e as { name: unknown }).name === "AbortError"
  );
}
