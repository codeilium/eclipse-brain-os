import { describe, expect, it } from "vitest";

import { safeMarkdownUrl } from "./markdown-url";

describe("safeMarkdownUrl", () => {
  it("passes through http, https, and mailto unchanged", () => {
    expect(safeMarkdownUrl("http://example.com")).toBe("http://example.com");
    expect(safeMarkdownUrl("https://example.com/path?q=1#frag")).toBe(
      "https://example.com/path?q=1#frag",
    );
    expect(safeMarkdownUrl("mailto:hello@example.com")).toBe(
      "mailto:hello@example.com",
    );
  });

  it("matches the scheme case-insensitively and trims surrounding whitespace", () => {
    expect(safeMarkdownUrl("HTTPS://Example.com")).toBe("HTTPS://Example.com");
    expect(safeMarkdownUrl("  https://example.com  ")).toBe(
      "https://example.com",
    );
    expect(safeMarkdownUrl("MailTo:hello@example.com")).toBe(
      "MailTo:hello@example.com",
    );
  });

  it("drops javascript:, data:, vbscript:, and other non-whitelisted schemes", () => {
    expect(safeMarkdownUrl("javascript:alert(1)")).toBe("");
    expect(safeMarkdownUrl("JavaScript:alert(1)")).toBe("");
    expect(safeMarkdownUrl("  javascript:alert(1)")).toBe("");
    expect(safeMarkdownUrl("data:text/html,<script>alert(1)</script>")).toBe("");
    expect(safeMarkdownUrl("vbscript:msgbox(1)")).toBe("");
    expect(safeMarkdownUrl("tel:+15551234567")).toBe("");
  });

  it("drops relative, protocol-relative, anchor, and empty urls", () => {
    expect(safeMarkdownUrl("/relative/path")).toBe("");
    expect(safeMarkdownUrl("//evil.example.com")).toBe("");
    expect(safeMarkdownUrl("#section")).toBe("");
    expect(safeMarkdownUrl("example.com")).toBe("");
    expect(safeMarkdownUrl("")).toBe("");
    expect(safeMarkdownUrl("   ")).toBe("");
  });
});
