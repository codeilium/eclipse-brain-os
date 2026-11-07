/**
 * The action-tier system (PRD 30) — the three registers every piece of
 * interactive text in the chrome wears, so primary actions, utilities, and
 * destructive actions stop reading as one undifferentiated letter-spaced haze.
 * The canonical definition lives in `eclipse-design-tokens.md` ("Interactive
 * text — the action tiers"); these constants are its code surface (the
 * `BODY_ACTION` idiom of the unify polish, made shared).
 *
 * A tier defines *register* only — resting/hover color and the one shared
 * hover transition. Size and tracking stay at each call site (a 9px moon verb
 * and an 11px corner trigger can share a tier), and the honest hit area is
 * composed separately so dense rows can take the smaller form.
 *
 * Warm = earned (§7) holds absolutely: every tier is cool/neutral
 * (`starlight`/`haze`), including hover. There is no alarm red — the palette
 * has none (locked, PRD 16); a destructive action is *quiet*, marked by its
 * own hover signature (the thin revealed underline), never by color heat.
 */

/**
 * The honest hit area: padding grows the interactive target comfortably
 * beyond the text while the negative margin keeps layout byte-identical —
 * nothing shifts, nothing re-flows, the chrome grid (the shared `p-8` inset)
 * still lands every visual edge exactly where it was. Presentation only:
 * same handlers, bigger targets.
 */
export const ACTION_HIT = "-m-2 p-2";

/**
 * The dense form, for action verbs inside rows (edit · delete · + sub).
 * Sized so adjacent targets in a `gap-2`-or-wider row never overlap — a click
 * near "edit" must never land on "delete".
 */
export const ACTION_HIT_DENSE = "-m-1 p-1";

/** The one hover transition every tier shares (duration.quick + ease.soft). */
const ACTION_TRANSITION = "transition-colors duration-200 ease-soft";

/**
 * Primary — the thing you'd most do here (+ new pursuit, a practice's
 * click-to-focus, distill, a form's armed submit, a catalog star row).
 * Slightly brighter at rest than the haze register; full starlight on hover.
 */
export const ACTION_PRIMARY = `${ACTION_TRANSITION} text-starlight/80 hover:text-starlight focus-visible:text-starlight`;

/**
 * Secondary / utility — the quiet haze register, formalized (reset view, the
 * catalog tab, settings, rename, cancel, the chrome line).
 */
export const ACTION_SECONDARY = `${ACTION_TRANSITION} text-haze/60 hover:text-haze focus-visible:text-haze`;

/**
 * Quiet-destructive (delete, abandon, clear-the-key) — calm, dimmest at rest,
 * and never mistakable for a primary: its hover signature is a thin revealed
 * underline (decoration, not layout) alongside a modest rise that stays in
 * haze, well short of any primary's starlight.
 */
export const ACTION_DESTRUCTIVE = `${ACTION_TRANSITION} text-haze/40 hover:text-haze/75 hover:underline decoration-haze/40 underline-offset-[6px] focus-visible:text-haze/75`;

/**
 * The resting color of a disabled/invalid action (an un-armed submit, the
 * in-flight "distilling…"). The arming *logic* stays at the call site —
 * this is only the shared dim. Compose with `ACTION_TRANSITION`-bearing
 * tiers via the call site's conditional.
 */
export const ACTION_DISABLED = `${ACTION_TRANSITION} text-haze/40`;

/**
 * The non-interactive status register (the saved cue). Not an action: no hit
 * area, no hover — just the quiet uniform dim for chrome that only reports.
 */
export const STATUS_CUE = "text-haze/35";
