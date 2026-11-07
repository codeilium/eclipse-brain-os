/**
 * Link-protocol safety for rendered markdown (PRD 19).
 *
 * `safeMarkdownUrl` is the single gate every link href passes through before it
 * reaches the DOM — wired into `react-markdown`'s `urlTransform`. It returns the
 * url only when it begins with `http:`, `https:`, or `mailto:` (scheme matched
 * case-insensitively, surrounding whitespace ignored); everything else —
 * `javascript:`, `data:`, `vbscript:`, `tel:`, protocol-relative, relative,
 * anchors, empty — collapses to `""` (a safe, non-navigable href).
 *
 * A **whitelist** (not a blacklist) is the robust choice: obfuscated schemes
 * (embedded tabs/newlines, control characters, unusual casing) can never slip
 * through, because only the three known-good prefixes are ever allowed. Combined
 * with `react-markdown` rendering to React elements (no `dangerouslySetInnerHTML`)
 * and no `rehype-raw` (so raw HTML is escaped, not parsed), this keeps the
 * notebook XSS-safe by construction. Pure + unit-tested.
 */

/** The only protocols a rendered link may carry. */
const SAFE_URL_SCHEME = /^(?:https?:|mailto:)/i;

export function safeMarkdownUrl(url: string): string {
  const trimmed = url.trim();
  return SAFE_URL_SCHEME.test(trimmed) ? trimmed : "";
}
