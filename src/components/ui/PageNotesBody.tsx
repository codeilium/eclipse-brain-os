"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

import type { PageState } from "@/persistence";
import type { PlanetId, StarId } from "@/universe";

/**
 * The rendered (read-mode) markdown view, lazy-loaded so `react-markdown` and its
 * parser land in their own chunk — off the home paint (PRD 19). It is only ever
 * needed once a page with content is read, which is inside a notes surface.
 * `ssr: false` because the notes surfaces are client-only; the brief load shows
 * nothing.
 */
const MarkdownView = dynamic(
  () => import("./MarkdownView").then((m) => m.MarkdownView),
  { ssr: false, loading: () => null },
);

// Shared with the rendered read view so the rendered markdown and the raw
// textarea occupy the same box (no layout shift on toggle; a little scroll jump
// is tolerated for v1). `app-scroll` (PRD 30): the app's thin cool scrollbar.
const BODY_BOX =
  "app-scroll flex-1 overflow-y-auto px-8 pb-8 text-sm font-light leading-relaxed tracking-wide text-starlight/85";

/**
 * A quiet save cue from `usePage`'s lifecycle status, shared by every notes
 * surface's header (the dock, PRD 18; the in-session panel, PRD 20). `idle`/
 * `loading` show nothing — a freshly opened page isn't "saved", it just is
 * (honest-universe); only an actual save in flight / settled / failed says so.
 */
export function statusLabel(status: PageState["status"]): string {
  switch (status) {
    case "saving":
      return "saving…";
    case "saved":
      return "saved";
    case "error":
      return "unsaved";
    default:
      return "";
  }
}

interface PageNotesBodyProps {
  /**
   * The body whose page this is — a star or a planet (moons have no page in V1).
   * Drives the switch-reset so a body change reopens in the right mode (read if it
   * has content, edit if empty). The owning surface passes the SAME id to
   * `usePage` (PRD 17), so this body and the autosave always agree.
   */
  readonly bodyId: StarId | PlanetId;
  /** The page's markdown — the owner's `usePage(bodyId).content`. */
  readonly content: string;
  /**
   * Persist an edit — the owner's `usePage(bodyId).save`. This is the **only**
   * save path; the value handed in is raw markdown and goes back unchanged
   * (rendering is a pure display transform, PRD 19). No second state, no copy.
   */
  readonly save: (markdown: string) => void;
  /**
   * Open directly in edit mode (PRD 35) — used when the dock is prefilled with an
   * approved planet-mind proposal, so the human lands in the focused, editable
   * textarea on the change. Defaults to false (the normal read/edit toggle: read
   * mode for a page with content, edit mode for an empty one).
   */
  readonly startInEdit?: boolean;
}

/**
 * The shared notes **body** — the PRD 18/19 read/edit toggle, extracted (PRD 20)
 * so both the page dock (PRD 18) and the in-session notes panel (PRD 20) reach the
 * *same* note through the *same* surface, never a fork. The owning surface holds
 * `usePage(bodyId)` (so it can show its own save cue in its own header) and passes
 * `content`/`save` in; this component owns only the read/edit display state.
 *
 * The toggle (PRD 19), unchanged:
 *
 * - **Read mode** is the default for a page *with* content: `content` rendered as
 *   markdown via the lazy `MarkdownView` (headings, emphasis, lists, links, code).
 * - **Click the rendered body → edit mode** — the raw `<textarea>`, focused
 *   (Enter/Space on the focused region do the same, so keyboard users aren't
 *   locked out). Clicking a rendered *link* follows it instead.
 * - **Blur the textarea → read mode** (re-render).
 * - A **never-written / emptied page stays in edit mode** with the placeholder —
 *   the textarea shows whenever `isEditing || content.trim() === ""` (lazy/honest,
 *   PRD 17). Switching bodies resets the mode to follow the new content.
 *
 * The stored value is **plain markdown** (PRD 17); rendering is a pure display
 * transform. The save path is **unchanged** — `value={content}`, `onChange={(e)
 * => save(e.target.value)}`. **Warm = earned (§7):** the textarea and rendered
 * output are entirely cool/neutral; rendered links are a cool amethyst, never gold.
 *
 * The `data-page-editor` attribute is the Escape hook the owning surfaces' Escape
 * ladders use (blur the active editor → read mode); only one notes body is ever
 * mounted at a time (the dock and the session panel are mutually exclusive), so a
 * single such textarea exists at once.
 */
export function PageNotesBody({
  bodyId,
  content,
  save,
  startInEdit = false,
}: PageNotesBodyProps) {
  // Read/edit toggle (PRD 19). The textarea shows whenever the user is editing OR
  // the page is empty (an empty page has nothing to render and is meant to be
  // written — lazy/honest); otherwise the rendered read view shows. `isEditing`
  // is the manual override: set by clicking the rendered body, cleared on blur.
  // Initialized true for a prefilled proposal (PRD 35 — `startInEdit`), so the
  // approved change opens directly in the editable textarea.
  const [isEditing, setIsEditing] = useState(startInEdit);

  // Switching bodies resets the mode — a notes surface stays mounted across a
  // switch (its stable key), so we reset with React's "adjust state during render"
  // pattern (guarded → runs once per bodyId change; no setState-in-effect, no
  // extra browser paint). The new body then opens in read mode if it has content,
  // edit mode if it's empty (the empty clause below), never carrying the old
  // body's editing state across.
  const [lastBodyId, setLastBodyId] = useState(bodyId);
  if (bodyId !== lastBodyId) {
    setLastBodyId(bodyId);
    setIsEditing(false);
  }

  const showEditor = isEditing || content.trim() === "";

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the textarea when edit mode is entered by a user action. A freshly
  // opened *empty* page is intentionally not auto-focused (its visible
  // placeholder invites a click, and it keeps the Escape ladder crisp).
  useEffect(() => {
    if (isEditing) textareaRef.current?.focus();
  }, [isEditing]);

  // Click the rendered body to edit — but let a click on a rendered link follow
  // the link (it opens in a new tab) rather than dropping into the editor.
  function handleReadClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("a")) return;
    setIsEditing(true);
  }

  // Keyboard parity: Enter/Space on the focused read region enters edit. Guarded
  // to the region itself so Enter on a focused rendered link still follows it.
  function handleReadKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsEditing(true);
    }
  }

  return showEditor ? (
    <textarea
      ref={textareaRef}
      data-page-editor
      value={content}
      onChange={(e) => save(e.target.value)}
      onBlur={() => setIsEditing(false)}
      placeholder="Write a note…"
      spellCheck={false}
      className={`${BODY_BOX} resize-none border-0 bg-transparent caret-haze outline-none placeholder:text-haze/30`}
    />
  ) : (
    <div
      tabIndex={0}
      onClick={handleReadClick}
      onKeyDown={handleReadKeyDown}
      aria-label="Note — activate to edit"
      className={`${BODY_BOX} cursor-text outline-none`}
    >
      <MarkdownView content={content} />
    </div>
  );
}
