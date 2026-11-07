import { describe, expect, it } from "vitest";

import {
  converse,
  DistillError,
  distillFog,
  planetConverse,
  planetPropose,
  reflect,
  starConverse,
  starPropose,
  starReflect,
} from "./client";
import {
  ANTHROPIC_MESSAGES_URL,
  CONVERSE_MAX_TOKENS,
  CONVERSE_SYSTEM_PROMPT,
  DISTILLER_SYSTEM_PROMPT,
  REFLECTION_MAX_TOKENS,
  type MindMessage,
  type StarSubtreeNote,
} from "./distill";

const FOG = "everything is circling around teaching, I think";
const KEY = "sk-ant-test-FAKE-KEY-never-real";

/** Distilling on the first turn = the PRD 28 one-shot: a single user turn. */
const FOG_MESSAGES: MindMessage[] = [{ role: "user", content: FOG }];
/** A short alternating transcript, the converse shape. */
const TRANSCRIPT: MindMessage[] = [
  { role: "user", content: FOG },
  { role: "assistant", content: "is this one pursuit or three?" },
  { role: "user", content: "one — teaching" },
];

/** A canned Messages API success body wrapping the given model text. */
function okResponse(text: string): Response {
  return new Response(
    JSON.stringify({ content: [{ type: "text", text }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

/** An injected fetch that records its calls and returns the queued response. */
function mockFetch(result: Response | Error) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchFn = (async (url, init) => {
    calls.push({ url: String(url), init });
    if (result instanceof Error) throw result;
    return result;
  }) as typeof fetch;
  return { fetchFn, calls };
}

describe("distillFog — the ok path through an injected fetch", () => {
  it("makes exactly ONE call to the one endpoint with the built request, and parses the reply", async () => {
    const { fetchFn, calls } = mockFetch(
      okResponse('{"signal": "teach the thing you are learning", "pursuitName": "Teaching"}'),
    );
    const result = await distillFog(FOG_MESSAGES, KEY, { fetchFn });
    expect(result).toEqual({
      signal: "teach the thing you are learning",
      pursuitName: "Teaching",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(ANTHROPIC_MESSAGES_URL);
    const init = calls[0]?.init;
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe(KEY);
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    const body: unknown = JSON.parse(String(init?.body));
    expect((body as Record<string, unknown>).system).toBe(DISTILLER_SYSTEM_PROMPT);
  });

  it("joins multiple text blocks before parsing", async () => {
    const { fetchFn } = mockFetch(
      new Response(
        JSON.stringify({
          content: [
            { type: "text", text: '{"signal": "split ' },
            { type: "text", text: 'across blocks", "pursuitName": null}' },
          ],
        }),
        { status: 200 },
      ),
    );
    await expect(distillFog(FOG_MESSAGES, KEY, { fetchFn })).resolves.toEqual({
      signal: "split across blocks",
      pursuitName: null,
    });
  });
});

describe("distillFog — safe error mapping (never the key, never the body)", () => {
  it("401 → 'the key was not accepted'", async () => {
    const { fetchFn, calls } = mockFetch(new Response("auth", { status: 401 }));
    const error = await distillFog(FOG_MESSAGES, KEY, { fetchFn }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DistillError);
    expect((error as DistillError).message).toBe("the key was not accepted");
    // One call, no retries — even on failure.
    expect(calls).toHaveLength(1);
  });

  it("429 → the rate-limit message (says to wait before retrying — PRD 35.1)", async () => {
    const { fetchFn } = mockFetch(new Response("slow down", { status: 429 }));
    await expect(distillFog(FOG_MESSAGES, KEY, { fetchFn })).rejects.toThrow(
      "too many requests just now — wait a few seconds and try again",
    );
  });

  it("a network failure → the safe generic, not the underlying error", async () => {
    const { fetchFn } = mockFetch(new TypeError(`fetch failed for key ${KEY}`));
    const error = await distillFog(FOG_MESSAGES, KEY, { fetchFn }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DistillError);
    expect((error as DistillError).message).toBe("the call didn't go through");
  });

  it("the key appears in NO error message, across every failure shape", async () => {
    const failures = [
      mockFetch(new Response("x", { status: 401 })),
      mockFetch(new Response("x", { status: 429 })),
      mockFetch(new Response("x", { status: 500 })),
      mockFetch(new TypeError(`refused: ${KEY}`)),
      mockFetch(new Response("not json", { status: 200 })),
    ];
    for (const { fetchFn } of failures) {
      const error = await distillFog(FOG_MESSAGES, KEY, { fetchFn }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(KEY);
      expect((error as Error).message.length).toBeLessThan(80); // short, displayable
    }
  });

  it("a deliberate abort is re-thrown as-is (the caller swallows a close, silently)", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    const { fetchFn } = mockFetch(abort as unknown as Error);
    const error = await distillFog(FOG_MESSAGES, KEY, { fetchFn }).catch((e: unknown) => e);
    expect(error).toBe(abort);
    expect((error as Error).name).toBe("AbortError");
  });

  it("a 200 with no text is not an answer — the safe generic", async () => {
    const { fetchFn } = mockFetch(
      new Response(JSON.stringify({ content: [] }), { status: 200 }),
    );
    await expect(distillFog(FOG_MESSAGES, KEY, { fetchFn })).rejects.toThrow(
      "the call didn't go through",
    );
  });
});

describe("converse — one conversational turn through an injected fetch (PRD 33)", () => {
  it("makes exactly ONE call to the endpoint with the converse request, returns the plain reply", async () => {
    const { fetchFn, calls } = mockFetch(okResponse("is this one pursuit, or several?"));
    const reply = await converse(TRANSCRIPT, KEY, { fetchFn });
    expect(reply).toBe("is this one pursuit, or several?");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(ANTHROPIC_MESSAGES_URL);
    const init = calls[0]?.init;
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe(KEY);
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    // Converse mode: the converse prompt + the small budget + the WHOLE transcript.
    expect(body.system).toBe(CONVERSE_SYSTEM_PROMPT);
    expect(body.max_tokens).toBe(CONVERSE_MAX_TOKENS);
    expect(body.messages).toEqual([
      { role: "user", content: FOG },
      { role: "assistant", content: "is this one pursuit or three?" },
      { role: "user", content: "one — teaching" },
    ]);
  });

  it("joins multiple text blocks before parsing", async () => {
    const { fetchFn } = mockFetch(
      new Response(
        JSON.stringify({
          content: [
            { type: "text", text: "what would " },
            { type: "text", text: "finishing it look like?" },
          ],
        }),
        { status: 200 },
      ),
    );
    await expect(converse(TRANSCRIPT, KEY, { fetchFn })).resolves.toBe(
      "what would finishing it look like?",
    );
  });

  it("maps 401 to the safe message, one call, no retries", async () => {
    const { fetchFn, calls } = mockFetch(new Response("auth", { status: 401 }));
    const error = await converse(TRANSCRIPT, KEY, { fetchFn }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DistillError);
    expect((error as DistillError).message).toBe("the key was not accepted");
    expect(calls).toHaveLength(1);
  });

  it("the key appears in NO error message, across every failure shape", async () => {
    const failures = [
      mockFetch(new Response("x", { status: 401 })),
      mockFetch(new Response("x", { status: 429 })),
      mockFetch(new Response("x", { status: 500 })),
      mockFetch(new TypeError(`refused: ${KEY}`)),
      mockFetch(new Response("not json", { status: 200 })),
    ];
    for (const { fetchFn } of failures) {
      const error = await converse(TRANSCRIPT, KEY, { fetchFn }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(KEY);
      expect((error as Error).message.length).toBeLessThan(80);
    }
  });

  it("a deliberate abort is re-thrown as-is (the caller swallows a close)", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    const { fetchFn } = mockFetch(abort as unknown as Error);
    const error = await converse(TRANSCRIPT, KEY, { fetchFn }).catch((e: unknown) => e);
    expect(error).toBe(abort);
    expect((error as Error).name).toBe("AbortError");
  });

  it("a 200 with no text → the safe generic", async () => {
    const { fetchFn } = mockFetch(
      new Response(JSON.stringify({ content: [] }), { status: 200 }),
    );
    await expect(converse(TRANSCRIPT, KEY, { fetchFn })).rejects.toThrow(
      "the call didn't go through",
    );
  });
});

/* ── PRD 34 — the planet mind, through the same injected fetch (real API never called) ── */

// Raw notes that must appear in NO thrown/displayed string — a greppable sentinel.
const NOTES = "PLANET-NOTES-SENTINEL: scales feel stiff; want a loose wrist.";
const PLANET_TRANSCRIPT: MindMessage[] = [
  { role: "user", content: "the stiffness is the thing" },
  { role: "assistant", content: "what does fluid feel like?" },
  { role: "user", content: "loose wrist" },
];

describe("reflect — one reflection through an injected fetch (PRD 34)", () => {
  it("makes exactly ONE call to the endpoint with the reflection request, returns the plain text", async () => {
    const { fetchFn, calls } = mockFetch(
      okResponse("you keep circling back to the stiffness, not the notes themselves"),
    );
    const text = await reflect(NOTES, KEY, { fetchFn });
    expect(text).toBe("you keep circling back to the stiffness, not the notes themselves");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(ANTHROPIC_MESSAGES_URL);
    const init = calls[0]?.init;
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe(KEY);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.max_tokens).toBe(REFLECTION_MAX_TOKENS);
    // The notes ride in the system (the request body, mocked) — not in the transcript.
    expect(body.system).toContain(NOTES);
  });

  it("maps 401 to the safe message; the key AND the raw notes appear in NO error", async () => {
    const failures = [
      mockFetch(new Response("x", { status: 401 })),
      mockFetch(new Response("x", { status: 500 })),
      mockFetch(new TypeError(`refused with ${KEY} and ${NOTES}`)),
      mockFetch(new Response("not json", { status: 200 })),
    ];
    for (const { fetchFn } of failures) {
      const error = await reflect(NOTES, KEY, { fetchFn }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(KEY);
      expect((error as Error).message).not.toContain("PLANET-NOTES-SENTINEL");
      expect((error as Error).message.length).toBeLessThan(80);
    }
  });

  it("a deliberate abort is re-thrown as-is; a 200-no-text → the safe generic", async () => {
    const abort = new DOMException("aborted", "AbortError");
    const aborted = await reflect(NOTES, KEY, {
      fetchFn: mockFetch(abort as unknown as Error).fetchFn,
    }).catch((e: unknown) => e);
    expect((aborted as Error).name).toBe("AbortError");

    const empty = mockFetch(new Response(JSON.stringify({ content: [] }), { status: 200 }));
    await expect(reflect(NOTES, KEY, { fetchFn: empty.fetchFn })).rejects.toThrow(
      "the call didn't go through",
    );
  });
});

describe("planetConverse — one notes-seeded turn through an injected fetch (PRD 34)", () => {
  it("makes ONE call, returns the plain reply; notes in the system, never in the transcript", async () => {
    const { fetchFn, calls } = mockFetch(okResponse("what would a loose wrist change?"));
    const reply = await planetConverse(NOTES, PLANET_TRANSCRIPT, KEY, { fetchFn });
    expect(reply).toBe("what would a loose wrist change?");
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(body.max_tokens).toBe(CONVERSE_MAX_TOKENS);
    expect(body.system).toContain(NOTES);
    expect(JSON.stringify(body.messages)).not.toContain(NOTES);
  });

  it("the key AND the raw notes appear in NO error message", async () => {
    const { fetchFn } = mockFetch(new TypeError(`fail ${KEY} ${NOTES}`));
    const error = await planetConverse(NOTES, PLANET_TRANSCRIPT, KEY, { fetchFn }).catch(
      (e: unknown) => e,
    );
    expect((error as Error).message).toBe("the call didn't go through");
    expect((error as Error).message).not.toContain("PLANET-NOTES-SENTINEL");
  });
});

describe("planetPropose — the notes-seeded note proposal through an injected fetch (PRD 35)", () => {
  it("makes ONE call and parses a proposed correction; notes in system, never in the transcript", async () => {
    const { fetchFn, calls } = mockFetch(
      okResponse(
        '{"kind": "correction", "oldText": "want a loose wrist", "newText": "the wrist is loosening"}',
      ),
    );
    const result = await planetPropose(NOTES, PLANET_TRANSCRIPT, KEY, { fetchFn });
    expect(result).toEqual({
      kind: "correction",
      oldText: "want a loose wrist",
      newText: "the wrist is loosening",
    });
    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.url)).toBe(ANTHROPIC_MESSAGES_URL);
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(body.system).toContain(NOTES);
    expect(JSON.stringify(body.messages)).not.toContain(NOTES);
  });

  it("a degraded reply parses to none (never a guessed edit, never a crash)", async () => {
    const { fetchFn } = mockFetch(okResponse("here is a note you could change"));
    const result = await planetPropose(NOTES, PLANET_TRANSCRIPT, KEY, { fetchFn });
    expect(result).toEqual({ kind: "none", oldText: null, newText: null });
  });

  it("maps a 401 to the safe key message", async () => {
    const { fetchFn } = mockFetch(new Response("nope", { status: 401 }));
    const error = await planetPropose(NOTES, PLANET_TRANSCRIPT, KEY, { fetchFn }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DistillError);
    expect((error as Error).message).toBe("the key was not accepted");
  });

  it("the key AND the raw notes appear in NO error message, across failures", async () => {
    const failures = [
      mockFetch(new Response("x", { status: 429 })),
      mockFetch(new TypeError(`boom ${KEY} ${NOTES}`)),
    ];
    for (const { fetchFn } of failures) {
      const error = await planetPropose(NOTES, PLANET_TRANSCRIPT, KEY, { fetchFn }).catch(
        (e: unknown) => e,
      );
      expect((error as Error).message).not.toContain(KEY);
      expect((error as Error).message).not.toContain("PLANET-NOTES-SENTINEL");
    }
  });

  it("a deliberate abort is re-thrown as-is (closing the panel is not an error)", async () => {
    const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
    const { fetchFn } = mockFetch(abortErr);
    const error = await planetPropose(NOTES, PLANET_TRANSCRIPT, KEY, { fetchFn }).catch(
      (e: unknown) => e,
    );
    expect((error as Error).name).toBe("AbortError");
  });

  it("an empty 200 is not an answer → the safe generic", async () => {
    const { fetchFn } = mockFetch(okResponse("   "));
    const error = await planetPropose(NOTES, PLANET_TRANSCRIPT, KEY, { fetchFn }).catch(
      (e: unknown) => e,
    );
    expect((error as Error).message).toBe("the call didn't go through");
  });
});

/* ── PRD 36 — the star mind, through the same injected fetch (real API never called) ── */

// Two greppable raw-notes sentinels — they must appear in NO thrown/displayed string.
const STAR_NOTE_SENTINEL_A = "STAR-NOTES-SENTINEL-A: recitals scare me";
const STAR_NOTE_SENTINEL_B = "STAR-NOTES-SENTINEL-B: left hand still stiff";
const STAR_BODIES: StarSubtreeNote[] = [
  { bodyId: "star-1", bodyName: "Learning Piano", kind: "star", notes: STAR_NOTE_SENTINEL_A },
  { bodyId: "planet-scales", bodyName: "Scales", kind: "planet", notes: STAR_NOTE_SENTINEL_B },
];
const STAR_TRANSCRIPT: MindMessage[] = [
  { role: "user", content: "the fear and the stiffness feel connected" },
  { role: "assistant", content: "what happens to the wrist on stage?" },
  { role: "user", content: "it locks" },
];

describe("starReflect — one cross-practice reflection through an injected fetch (PRD 36)", () => {
  it("makes ONE call, returns the plain text; the whole subtree rides in the system", async () => {
    const { fetchFn, calls } = mockFetch(
      okResponse("the locking wrist and the stage fear are the same thread"),
    );
    const text = await starReflect(STAR_BODIES, KEY, { fetchFn });
    expect(text).toBe("the locking wrist and the stage fear are the same thread");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(ANTHROPIC_MESSAGES_URL);
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(body.max_tokens).toBe(REFLECTION_MAX_TOKENS);
    expect(body.system).toContain(STAR_NOTE_SENTINEL_A);
    expect(body.system).toContain(STAR_NOTE_SENTINEL_B);
  });

  it("the key AND every body's raw notes appear in NO error, across failures", async () => {
    const failures = [
      mockFetch(new Response("x", { status: 401 })),
      mockFetch(new TypeError(`boom ${KEY} ${STAR_NOTE_SENTINEL_A} ${STAR_NOTE_SENTINEL_B}`)),
      mockFetch(new Response("not json", { status: 200 })),
    ];
    for (const { fetchFn } of failures) {
      const error = await starReflect(STAR_BODIES, KEY, { fetchFn }).catch((e: unknown) => e);
      expect((error as Error).message).not.toContain(KEY);
      expect((error as Error).message).not.toContain("STAR-NOTES-SENTINEL-A");
      expect((error as Error).message).not.toContain("STAR-NOTES-SENTINEL-B");
      expect((error as Error).message.length).toBeLessThan(80);
    }
  });
});

describe("starConverse — one subtree-seeded turn through an injected fetch (PRD 36)", () => {
  it("makes ONE call, returns the plain reply; subtree in system, never in the transcript", async () => {
    const { fetchFn, calls } = mockFetch(okResponse("does the fear come before the lock, or after?"));
    const reply = await starConverse(STAR_BODIES, STAR_TRANSCRIPT, KEY, { fetchFn });
    expect(reply).toBe("does the fear come before the lock, or after?");
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(body.max_tokens).toBe(CONVERSE_MAX_TOKENS);
    expect(body.system).toContain(STAR_NOTE_SENTINEL_A);
    expect(JSON.stringify(body.messages)).not.toContain("STAR-NOTES-SENTINEL");
  });

  it("the key AND the raw notes appear in NO error message", async () => {
    const { fetchFn } = mockFetch(new TypeError(`fail ${KEY} ${STAR_NOTE_SENTINEL_A}`));
    const error = await starConverse(STAR_BODIES, STAR_TRANSCRIPT, KEY, { fetchFn }).catch(
      (e: unknown) => e,
    );
    expect((error as Error).message).toBe("the call didn't go through");
    expect((error as Error).message).not.toContain("STAR-NOTES-SENTINEL");
  });
});

describe("starPropose — the subtree-seeded, target-naming proposal through an injected fetch (PRD 36)", () => {
  it("makes ONE call and parses a proposal naming a specific body (validated against the subtree)", async () => {
    const { fetchFn, calls } = mockFetch(
      okResponse(
        '{"targetBodyId": "planet-scales", "kind": "correction", "oldText": "left hand still stiff", "newText": "left hand is loosening"}',
      ),
    );
    const result = await starPropose(STAR_BODIES, STAR_TRANSCRIPT, KEY, { fetchFn });
    expect(result).toEqual({
      kind: "correction",
      targetBodyId: "planet-scales",
      targetBodyName: "Scales",
      targetKind: "planet",
      oldText: "left hand still stiff",
      newText: "left hand is loosening",
    });
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(body.system).toContain(STAR_NOTE_SENTINEL_B);
    expect(JSON.stringify(body.messages)).not.toContain("STAR-NOTES-SENTINEL");
  });

  it("an unknown target / degraded reply parses to none (never a wrong-note edit, never a crash)", async () => {
    const unknown = mockFetch(
      okResponse('{"targetBodyId": "planet-not-here", "kind": "addition", "newText": "x"}'),
    );
    expect((await starPropose(STAR_BODIES, STAR_TRANSCRIPT, KEY, { fetchFn: unknown.fetchFn })).kind).toBe(
      "none",
    );
    const degraded = mockFetch(okResponse("a free-text musing, no JSON"));
    expect((await starPropose(STAR_BODIES, STAR_TRANSCRIPT, KEY, { fetchFn: degraded.fetchFn })).kind).toBe(
      "none",
    );
  });

  it("maps a 401 to the safe key message; the key AND raw notes appear in NO error", async () => {
    const { fetchFn } = mockFetch(new Response("nope", { status: 401 }));
    const error = await starPropose(STAR_BODIES, STAR_TRANSCRIPT, KEY, { fetchFn }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DistillError);
    expect((error as Error).message).toBe("the key was not accepted");

    const { fetchFn: f2 } = mockFetch(new TypeError(`boom ${KEY} ${STAR_NOTE_SENTINEL_A}`));
    const e2 = await starPropose(STAR_BODIES, STAR_TRANSCRIPT, KEY, { fetchFn: f2 }).catch(
      (e: unknown) => e,
    );
    expect((e2 as Error).message).not.toContain(KEY);
    expect((e2 as Error).message).not.toContain("STAR-NOTES-SENTINEL");
  });

  it("a deliberate abort is re-thrown as-is; an empty 200 → the safe generic", async () => {
    const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
    const aborted = await starPropose(STAR_BODIES, STAR_TRANSCRIPT, KEY, {
      fetchFn: mockFetch(abortErr).fetchFn,
    }).catch((e: unknown) => e);
    expect((aborted as Error).name).toBe("AbortError");

    const empty = mockFetch(okResponse("   "));
    await expect(
      starPropose(STAR_BODIES, STAR_TRANSCRIPT, KEY, { fetchFn: empty.fetchFn }),
    ).rejects.toThrow("the call didn't go through");
  });
});
