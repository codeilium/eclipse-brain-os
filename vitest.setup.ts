import "fake-indexeddb/auto";

// Polyfill BroadcastChannel for environments that lack it — fake-indexeddb does
// not provide one. Node 24 has a native global BroadcastChannel, so this branch
// is typically skipped. (The persistence layer only ever *posts* to the channel,
// never reads it, so a no-op stub is functionally equivalent for tests.)
if (typeof globalThis.BroadcastChannel === "undefined") {
  globalThis.BroadcastChannel = class {
    constructor(public name: string) {}
    postMessage(): void {}
    close(): void {}
    onmessage: ((ev: MessageEvent) => void) | null = null;
    addEventListener(): void {}
    removeEventListener(): void {}
  } as unknown as typeof BroadcastChannel;
}
