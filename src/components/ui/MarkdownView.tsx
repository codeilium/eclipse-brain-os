"use client";

import ReactMarkdown, { type Components } from "react-markdown";

import { safeMarkdownUrl } from "./markdown-url";

/**
 * The core markdown subset PRD 19 renders — headings, emphasis, ordered +
 * unordered lists, links, inline code, fenced code blocks (plus paragraphs and
 * soft breaks). Everything outside this whitelist (images, blockquotes, rules,
 * tables, task lists, footnotes) is dropped; GFM-only syntax never parses (no
 * `remark-gfm`), and raw HTML is escaped rather than rendered (no `rehype-raw`).
 */
const CORE_ELEMENTS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "a",
  "code",
  "pre",
  "br",
];

// Inline code. Inside a fenced block the `pre` below neutralises this fill /
// padding / size via child selectors (a descendant combinator out-specifies the
// element's own class), so one class serves both inline and block code.
const INLINE_CODE =
  "rounded bg-haze/10 px-1 py-0.5 font-mono text-[0.85em] text-starlight/90";

// A rendered link is a cool amethyst accent — never `corona`/gold (warm = earned,
// §7). The shade is the by-eye tunable: bump toward `haze` if amethyst reads dim.
const LINK =
  "text-amethyst underline decoration-amethyst/50 underline-offset-2 transition-colors duration-200 ease-soft hover:text-starlight hover:decoration-starlight/60";

/**
 * Every rendered element styled to the dock's cool/neutral identity. Each
 * component destructures only what it uses (so react-markdown's `node` prop never
 * reaches the DOM); the base typography (size / weight / leading / colour) is
 * inherited from the read-view container in `PageDock`.
 */
const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-6 text-lg font-light tracking-wide text-starlight/90 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-6 text-base font-light tracking-wide text-starlight/90 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-5 text-sm font-normal uppercase tracking-[0.2em] text-haze first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1 mt-4 text-xs font-normal uppercase tracking-[0.2em] text-haze/70 first:mt-0">
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 className="mb-1 mt-4 text-xs font-normal uppercase tracking-[0.2em] text-haze/70 first:mt-0">
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 className="mb-1 mt-4 text-xs font-normal uppercase tracking-[0.2em] text-haze/60 first:mt-0">
      {children}
    </h6>
  ),
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-medium text-starlight">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-starlight/90">{children}</em>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5 marker:text-haze/40">
      {children}
    </ul>
  ),
  ol: ({ children, start }) => (
    <ol
      start={start}
      className="my-2 list-decimal space-y-1 pl-5 marker:text-haze/40"
    >
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK}
      >
        {children}
      </a>
    ) : (
      // A blocked (non-whitelisted) protocol renders as inert text, never a link.
      <span className="text-starlight/85">{children}</span>
    ),
  code: ({ children }) => <code className={INLINE_CODE}>{children}</code>,
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-md bg-haze/[0.06] p-4 font-mono text-xs leading-relaxed text-starlight/85 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[length:inherit] [&_code]:text-inherit">
      {children}
    </pre>
  ),
};

interface MarkdownViewProps {
  /** The page's markdown — already plain markdown from `usePage` (PRD 17). */
  readonly content: string;
}

/**
 * The rendered (read-mode) view of a page's markdown (PRD 19). A pure display
 * transform of the `content` string — it never persists or mutates anything; the
 * stored value stays plain markdown and the textarea save path is unchanged.
 *
 * Lazy-loaded by `PageDock` (`next/dynamic`, `ssr: false`) so `react-markdown` +
 * its parser land in their own chunk, off the home paint. Safe by construction:
 * renders to React elements (no `dangerouslySetInnerHTML`), no raw HTML (no
 * `rehype-raw` → raw HTML is escaped), link protocols whitelisted
 * (`urlTransform={safeMarkdownUrl}`), and the element set restricted to the core
 * subset (`allowedElements`). Styled cool/neutral — the only warm element in the
 * app remains the canvas star (§7).
 */
export function MarkdownView({ content }: MarkdownViewProps) {
  return (
    <ReactMarkdown
      allowedElements={CORE_ELEMENTS}
      unwrapDisallowed
      urlTransform={safeMarkdownUrl}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
}
