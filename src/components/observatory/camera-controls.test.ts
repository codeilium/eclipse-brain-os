import { describe, expect, it } from "vitest";

import { DISK_RADIUS } from "./stars/position";
import {
  clamp,
  clampPanAxis,
  clampZoom,
  dampTo,
  DRAG_THRESHOLD_PX,
  idleFactorTarget,
  IDLE_DELAY_MS,
  KEY_ZOOM_FACTOR,
  keyboardPanWorldStep,
  keyboardZoomStep,
  mapKeyToCameraAction,
  MAX_ZOOM,
  MIN_ZOOM,
  nextIdleFactor,
  MIN_PAN_BOUND,
  PAN_MARGIN,
  panBoundForExtent,
  panWorldDelta,
  zoomTowardCursor,
} from "./camera-controls";

const FOV = Math.PI / 3; // 60° — the Observatory camera fov
const TAN30 = Math.tan(FOV / 2); // tan(30°) ≈ 0.57735

describe("clamp", () => {
  it("returns the value when within range", () => {
    expect(clamp(3, 0, 5)).toBe(3);
  });
  it("clamps below the min", () => {
    expect(clamp(-2, 0, 5)).toBe(0);
  });
  it("clamps above the max", () => {
    expect(clamp(9, 0, 5)).toBe(5);
  });
});

describe("clampZoom", () => {
  it("passes a distance inside the dolly range unchanged", () => {
    expect(clampZoom(5)).toBe(5);
  });
  it("clamps to MIN_ZOOM when too close", () => {
    expect(clampZoom(MIN_ZOOM - 3)).toBe(MIN_ZOOM);
  });
  it("clamps to MAX_ZOOM when too far", () => {
    expect(clampZoom(MAX_ZOOM + 50)).toBe(MAX_ZOOM);
  });
  it("keeps a sensible, navigable range (in < default < out)", () => {
    expect(MIN_ZOOM).toBeLessThan(MAX_ZOOM);
    expect(MIN_ZOOM).toBeGreaterThan(0);
  });
});

describe("MIN_PAN_BOUND (the floor)", () => {
  it("is derived from DISK_RADIUS (not hardcoded) plus a margin", () => {
    // Locks the parameterization: if the seeding disk loosens, the floor tracks
    // it automatically (PRD 13 §5; the live bound tracks the extent — PRD 23).
    expect(MIN_PAN_BOUND).toBe(DISK_RADIUS + PAN_MARGIN);
  });
  it("lets the user reach any seeded star (floor ≥ disk radius)", () => {
    expect(MIN_PAN_BOUND).toBeGreaterThanOrEqual(DISK_RADIUS);
  });
});

describe("panBoundForExtent (PRD 23 — bound tracks the system extent)", () => {
  it("returns the floor for an empty/tiny universe (extent 0)", () => {
    expect(panBoundForExtent(0)).toBe(MIN_PAN_BOUND);
  });
  it("grows with the system extent so a grown system stays reachable", () => {
    const grown = panBoundForExtent(5);
    expect(grown).toBeGreaterThan(MIN_PAN_BOUND);
    // A system extending E (scaled) from a disk-edge star reaches DISK_RADIUS+E;
    // the bound adds PAN_MARGIN so it can be centered with room.
    expect(grown).toBe(DISK_RADIUS + 5 + PAN_MARGIN);
  });
  it("never drops below the floor (a small extent keeps today's bound)", () => {
    for (const e of [0, 0.001, 0.5, 1]) {
      expect(panBoundForExtent(e)).toBeGreaterThanOrEqual(MIN_PAN_BOUND);
    }
  });
});

describe("clampPanAxis (clamps to the live bound)", () => {
  it("passes a pan within bounds unchanged", () => {
    expect(clampPanAxis(1, MIN_PAN_BOUND)).toBe(1);
    expect(clampPanAxis(-1, MIN_PAN_BOUND)).toBe(-1);
  });
  it("clamps panning too far into the void on either side", () => {
    expect(clampPanAxis(MIN_PAN_BOUND + 10, MIN_PAN_BOUND)).toBe(MIN_PAN_BOUND);
    expect(clampPanAxis(-MIN_PAN_BOUND - 10, MIN_PAN_BOUND)).toBe(-MIN_PAN_BOUND);
  });
  it("honours a larger (grown-universe) bound", () => {
    const bound = panBoundForExtent(8);
    expect(clampPanAxis(bound - 1, bound)).toBe(bound - 1);
    expect(clampPanAxis(bound + 5, bound)).toBe(bound);
  });
});

describe("panWorldDelta", () => {
  it("converts pixels to world units at the visible scale", () => {
    // unitsPerPixel = 2·zoom·tan(fov/2) / H
    const H = 1000;
    const zoom = 5;
    const [dx] = panWorldDelta(100, 0, zoom, H, FOV);
    const expectedPerPixel = (2 * zoom * TAN30) / H;
    expect(Math.abs(dx)).toBeCloseTo(100 * expectedPerPixel, 6);
  });

  it("moves the pan target OPPOSITE the drag on x (grab-the-sky)", () => {
    // Drag the pointer right → content follows right → camera/pan moves left.
    const [dx] = panWorldDelta(100, 0, 5, 1000, FOV);
    expect(dx).toBeLessThan(0);
  });

  it("raises the pan target when dragging down (screen-y down → world-y up)", () => {
    const [, dy] = panWorldDelta(0, 100, 5, 1000, FOV);
    expect(dy).toBeGreaterThan(0);
  });

  it("scales with zoom — the same drag covers more world when zoomed out", () => {
    const near = panWorldDelta(100, 0, 2, 1000, FOV)[0];
    const far = panWorldDelta(100, 0, 10, 1000, FOV)[0];
    expect(Math.abs(far)).toBeCloseTo(Math.abs(near) * 5, 6);
  });
});

describe("zoomTowardCursor", () => {
  it("leaves the pan unchanged when zooming toward the view center", () => {
    const [px, py] = zoomTowardCursor(1, -2, 5, 3, 0, 0, FOV, 1.6);
    expect(px).toBe(1);
    expect(py).toBe(-2);
  });

  it("shifts the pan so the point under an off-center cursor stays fixed", () => {
    const aspect = 1.6;
    const zoom = 5;
    const newZoom = 3; // zooming IN
    const [px, py] = zoomTowardCursor(0, 0, zoom, newZoom, 1, 0.5, FOV, aspect);
    // newPan = pan + ndc · tan · (zoom − newZoom)  (×aspect on x)
    expect(px).toBeCloseTo(1 * TAN30 * aspect * (zoom - newZoom), 6);
    expect(py).toBeCloseTo(0.5 * TAN30 * (zoom - newZoom), 6);
  });

  it("verifies the world point under the cursor is actually preserved", () => {
    const aspect = 1.6;
    const ndcX = 0.7;
    const ndcY = -0.4;
    const zoom = 6;
    const newZoom = 2.5;
    const panX = 0.3;
    const panY = -0.8;
    // World point under the cursor before the zoom…
    const wxBefore = panX + ndcX * zoom * TAN30 * aspect;
    const wyBefore = panY + ndcY * zoom * TAN30;
    const [npx, npy] = zoomTowardCursor(
      panX,
      panY,
      zoom,
      newZoom,
      ndcX,
      ndcY,
      FOV,
      aspect,
    );
    // …equals the world point under the same cursor after the zoom.
    const wxAfter = npx + ndcX * newZoom * TAN30 * aspect;
    const wyAfter = npy + ndcY * newZoom * TAN30;
    expect(wxAfter).toBeCloseTo(wxBefore, 6);
    expect(wyAfter).toBeCloseTo(wyBefore, 6);
  });
});

describe("dampTo", () => {
  it("moves toward the target", () => {
    const next = dampTo(0, 1, 1 / 60, 0.2);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
  });

  it("snaps to the target within epsilon", () => {
    expect(dampTo(1 - 1e-6, 1, 1 / 60, 0.2)).toBe(1);
  });

  it("is a no-op at delta = 0", () => {
    expect(dampTo(0.25, 1, 0, 0.2)).toBe(0.25);
  });

  it("returns the target immediately for a non-positive time-constant", () => {
    expect(dampTo(0, 1, 1 / 60, 0)).toBe(1);
  });

  it("is frame-rate independent (one big step ≈ many small steps)", () => {
    const tau = 0.5;
    const big = dampTo(0, 1, 1.0, tau);
    let small = 0;
    for (let i = 0; i < 10; i++) small = dampTo(small, 1, 0.1, tau);
    expect(big).toBeCloseTo(small, 2);
  });

  it("never overshoots the target", () => {
    // A huge delta closes almost all of the gap but stays ≤ target.
    expect(dampTo(0, 1, 100, 0.2)).toBeLessThanOrEqual(1);
  });
});

describe("idleFactorTarget", () => {
  it("is 0 (stillness) while still within the idle delay", () => {
    expect(idleFactorTarget(0)).toBe(0);
    expect(idleFactorTarget(IDLE_DELAY_MS - 1)).toBe(0);
  });

  it("is 1 (breathe) once idle past the delay", () => {
    expect(idleFactorTarget(IDLE_DELAY_MS)).toBe(1);
    expect(idleFactorTarget(IDLE_DELAY_MS + 5000)).toBe(1);
  });

  it("honors a custom delay", () => {
    expect(idleFactorTarget(500, 1000)).toBe(0);
    expect(idleFactorTarget(1500, 1000)).toBe(1);
  });
});

describe("nextIdleFactor", () => {
  it("eases toward stillness (0) while actively dragging, even if 'idle'", () => {
    const next = nextIdleFactor(1, true, 999999, 1 / 60);
    expect(next).toBeLessThan(1);
  });

  it("eases toward stillness (0) within the idle delay", () => {
    const next = nextIdleFactor(0.8, false, 100, 1 / 60);
    expect(next).toBeLessThan(0.8);
  });

  it("eases toward breathing (1) once idle past the delay", () => {
    const next = nextIdleFactor(0, false, IDLE_DELAY_MS + 10, 1 / 60);
    expect(next).toBeGreaterThan(0);
  });

  it("stays within [0, 1]", () => {
    let f = 0;
    for (let i = 0; i < 600; i++) f = nextIdleFactor(f, false, 999999, 1 / 60);
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(1);
    expect(f).toBeCloseTo(1, 3); // converges to breathing
  });
});

describe("interaction constants", () => {
  it("uses a small but non-trivial drag threshold (px)", () => {
    expect(DRAG_THRESHOLD_PX).toBeGreaterThan(0);
    expect(DRAG_THRESHOLD_PX).toBeLessThan(20);
  });
});

describe("mapKeyToCameraAction (PRD 15 keyboard camera)", () => {
  it("maps arrow keys to pan in the right screen directions", () => {
    expect(mapKeyToCameraAction("ArrowLeft")).toEqual({ kind: "pan", dx: -1, dy: 0 });
    expect(mapKeyToCameraAction("ArrowRight")).toEqual({ kind: "pan", dx: 1, dy: 0 });
    expect(mapKeyToCameraAction("ArrowUp")).toEqual({ kind: "pan", dx: 0, dy: 1 });
    expect(mapKeyToCameraAction("ArrowDown")).toEqual({ kind: "pan", dx: 0, dy: -1 });
  });

  it("maps WASD to the same pan actions as the arrows (lower + upper case)", () => {
    expect(mapKeyToCameraAction("a")).toEqual(mapKeyToCameraAction("ArrowLeft"));
    expect(mapKeyToCameraAction("d")).toEqual(mapKeyToCameraAction("ArrowRight"));
    expect(mapKeyToCameraAction("w")).toEqual(mapKeyToCameraAction("ArrowUp"));
    expect(mapKeyToCameraAction("s")).toEqual(mapKeyToCameraAction("ArrowDown"));
    expect(mapKeyToCameraAction("W")).toEqual(mapKeyToCameraAction("ArrowUp")); // caps-lock
  });

  it("maps +/=/PageUp to zoom in and -/_/PageDown to zoom out", () => {
    expect(mapKeyToCameraAction("+")).toEqual({ kind: "zoom", dir: "in" });
    expect(mapKeyToCameraAction("=")).toEqual({ kind: "zoom", dir: "in" });
    expect(mapKeyToCameraAction("PageUp")).toEqual({ kind: "zoom", dir: "in" });
    expect(mapKeyToCameraAction("-")).toEqual({ kind: "zoom", dir: "out" });
    expect(mapKeyToCameraAction("_")).toEqual({ kind: "zoom", dir: "out" });
    expect(mapKeyToCameraAction("PageDown")).toEqual({ kind: "zoom", dir: "out" });
  });

  it("maps 0 to reset and never binds Escape (reserved for overlays)", () => {
    expect(mapKeyToCameraAction("0")).toEqual({ kind: "reset" });
    expect(mapKeyToCameraAction("Escape")).toBeNull();
  });

  it("returns null for unbound keys (so the caller doesn't preventDefault them)", () => {
    expect(mapKeyToCameraAction("q")).toBeNull();
    expect(mapKeyToCameraAction("Enter")).toBeNull();
    expect(mapKeyToCameraAction(" ")).toBeNull();
    expect(mapKeyToCameraAction("Tab")).toBeNull();
  });
});

describe("keyboardPanWorldStep", () => {
  it("pans a fixed FRACTION of the visible height, so it scales with zoom", () => {
    const near = keyboardPanWorldStep(MIN_ZOOM, FOV);
    const far = keyboardPanWorldStep(MAX_ZOOM, FOV);
    expect(near).toBeGreaterThan(0);
    // 5× the zoom distance → 5× the world step (the visible height is linear in zoom).
    expect(far / near).toBeCloseTo(MAX_ZOOM / MIN_ZOOM, 5);
  });

  it("equals KEY_PAN_FRACTION × the visible height at that zoom", () => {
    const zoom = 5;
    const visibleHeight = 2 * zoom * TAN30;
    expect(keyboardPanWorldStep(zoom, FOV)).toBeCloseTo(0.15 * visibleHeight, 6);
  });

  it("a few presses stay reachable within the pan bound", () => {
    // A pan step at the default zoom is a modest fraction of the field, not a leap.
    expect(keyboardPanWorldStep(5, FOV)).toBeLessThan(MIN_PAN_BOUND);
  });
});

describe("keyboardZoomStep", () => {
  it("zooming in shrinks the distance; out grows it (multiplicative)", () => {
    expect(keyboardZoomStep(5, "in")).toBeCloseTo(5 / KEY_ZOOM_FACTOR, 6);
    expect(keyboardZoomStep(5, "out")).toBeCloseTo(5 * KEY_ZOOM_FACTOR, 6);
  });

  it("honors the SAME clamps as wheel/pinch zoom", () => {
    // Already at the near limit → a zoom-in can't go below MIN_ZOOM.
    expect(keyboardZoomStep(MIN_ZOOM, "in")).toBe(MIN_ZOOM);
    // Already at the far limit → a zoom-out can't exceed MAX_ZOOM.
    expect(keyboardZoomStep(MAX_ZOOM, "out")).toBe(MAX_ZOOM);
  });

  it("a round-trip in/out returns near the original within range", () => {
    const z = 5;
    expect(keyboardZoomStep(keyboardZoomStep(z, "in"), "out")).toBeCloseTo(z, 6);
  });
});
