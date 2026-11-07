"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  ACTION_DISABLED,
  ACTION_HIT,
  ACTION_PRIMARY,
  ACTION_SECONDARY,
} from "./action-tiers";
import { isValidBodyName } from "./validation";

interface CreateBodyFormProps {
  /**
   * Called with a trimmed name and a trimmed-or-null description once the form is
   * submitted with a valid name — for both create and **edit** (PRD 16): the form
   * is the same; only the parent's handler differs (add-a-body vs. save-the-edit).
   * The parent owns the universe mutation + persistence (`page.tsx` →
   * `useUniverse().update`); the form only collects and validates input. See
   * `r3f-conventions.md` §12.
   */
  readonly onCreate: (name: string, description: string | null) => void;
  /**
   * When provided, a quiet "cancel" affordance and the Escape key dismiss the
   * form (the persistent "+ new pursuit" / "+ add practice" entry points).
   * Omitted for first-run onboarding, where there is nothing to cancel back to.
   */
  readonly onCancel?: () => void;
  /**
   * The submit button label. Defaults to "Begin" — the calm verb shared by the
   * star and planet create flows. Edit mode passes "Save" (PRD 16).
   */
  readonly submitLabel?: string;
  /**
   * The gentle hint shown on an empty-name submit. Defaults to the star wording;
   * the planet flow passes "A practice needs a name." so the cue fits the body.
   */
  readonly nameHint?: string;
  /**
   * Edit mode (PRD 16): the body's current name / description, pre-filled when
   * the form opens. Omitted for create (defaults to empty). Pre-fill + re-label
   * (`submitLabel="Save"`) is all an edit needs — it is the *same* form, not a
   * new one, and it can only ever change name + description (the honest-universe
   * principle is enforced upstream in the `editXDetails` mutators).
   */
  readonly initialName?: string;
  readonly initialDescription?: string;
  /**
   * Name-only mode (PRD 27 — galaxies): skip the description field entirely.
   * A `Galaxy` stores no description, and the form never collects what isn't
   * stored; `onCreate` receives `null` for the description. Additive — every
   * existing (star/planet/moon) call site keeps both fields.
   */
  readonly nameOnly?: boolean;
  /**
   * Cool caret (PRD 27): the galaxy switcher's panel is strictly cool/neutral
   * (warm = earned), so its forms use `caret-haze` instead of the create flow's
   * warm `caret-corona`. Additive — existing call sites keep the warm caret.
   */
  readonly coolCaret?: boolean;
}

/**
 * The shared create-a-body form: a required name and an optional description.
 * No color, no icon, no other fields — a body is name + optional description,
 * and its color is always derived from earned brightness. Used by all three
 * entry points: first-run `Onboarding`, the "+ new pursuit" `NewPursuitButton`
 * (stars), and the selected-star `StarContext` ("+ add practice" / "+ sub-practice"
 * and the pre-filled edit forms). One form, no duplicated logic — only the copy
 * (`submitLabel`, `nameHint`) and the surrounding framing differ
 * (`r3f-conventions.md` §12.5).
 *
 * Restrained by design: quiet underlined inputs (not boxed fields), letterspaced
 * caps labels echoing the wordmark, the void showing through. No web storage —
 * state is ephemeral until persisted to IndexedDB via the parent.
 */
export function CreateBodyForm({
  onCreate,
  onCancel,
  submitLabel = "Begin",
  nameHint = "A star needs a name.",
  initialName = "",
  initialDescription = "",
  nameOnly = false,
  coolCaret = false,
}: CreateBodyFormProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [attempted, setAttempted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Unique field ids per form instance — no hardcoded "star-name", so the form
  // is body-agnostic and two instances could never collide on a DOM id.
  const nameId = useId();
  const descriptionId = useId();

  // Focus the name field when the form opens (every entry point mounts it fresh).
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const valid = isValidBodyName(name);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid) {
      // Gentle no-op: surface a calm cue and re-focus, never a jarring error.
      setAttempted(true);
      nameRef.current?.focus();
      return;
    }
    onCreate(name.trim(), description.trim() || null);
    setName("");
    setDescription("");
    setAttempted(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Escape" && onCancel) {
      onCancel();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      noValidate
      className="flex w-80 max-w-full flex-col gap-8"
    >
      <div className="flex flex-col gap-2">
        <label
          htmlFor={nameId}
          className="text-[10px] font-light uppercase tracking-[0.4em] text-haze"
        >
          Name
        </label>
        <input
          id={nameId}
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          className={`border-b border-haze/30 bg-transparent pb-2 text-lg font-light text-starlight outline-none transition-colors duration-200 ease-soft focus:border-haze/80 ${
            coolCaret ? "caret-haze" : "caret-corona"
          }`}
        />
        {attempted && !valid && (
          <p className="text-[11px] font-light tracking-wide text-haze/70">
            {nameHint}
          </p>
        )}
      </div>

      {!nameOnly && (
        <div className="flex flex-col gap-2">
          <label
            htmlFor={descriptionId}
            className="flex items-baseline gap-2 text-[10px] font-light uppercase tracking-[0.4em] text-haze/70"
          >
            Description
            <span className="tracking-normal text-haze/40 normal-case">— optional</span>
          </label>
          <input
            id={descriptionId}
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoComplete="off"
            className="border-b border-haze/20 bg-transparent pb-2 text-sm font-light text-haze outline-none transition-colors duration-200 ease-soft focus:border-haze/60"
          />
        </div>
      )}

      <div className="flex items-center gap-8 pt-2">
        <button
          type="submit"
          className={`text-xs font-light uppercase tracking-[0.3em] ${ACTION_HIT} ${
            valid ? ACTION_PRIMARY : ACTION_DISABLED
          }`}
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className={`text-xs font-light uppercase tracking-[0.3em] ${ACTION_HIT} ${ACTION_SECONDARY}`}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
