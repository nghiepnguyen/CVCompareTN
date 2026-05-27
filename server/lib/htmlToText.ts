/**
 * Safe HTML-to-text converter using cheerio for parsing and `he` for entity decoding.
 * Replaces the old regex-based stripHtmlTags() + decodeHTMLEntities() approach
 * which triggered CodeQL "Bad HTML filtering regexp" and "Incomplete multi-character sanitization" alerts.
 */
import { load } from "cheerio";
import he from "he";

/**
 * Convert HTML string to plain text with structural newlines preserved.
 * - Strips script, style, noscript, iframe, svg, head, nav, header, footer, aside
 * - Converts block elements to double-newline separators
 * - Converts line-break elements (br, li, tr, dt, dd) to single newlines
 * - Removes all remaining HTML tags via cheerio's built-in text() method
 * - Decodes HTML entities via `he` library (robust, spec-compliant)
 */
export function htmlToText(html: string): string {
  const $ = load(html, { xml: { decodeEntities: false } }, false);

  // Remove noisy elements entirely (no readable text contribution)
  $("script, style, noscript, iframe, svg, head, nav, header, footer, aside").remove();

  // Remove HTML comments
  $("*")
    .contents()
    .each(function () {
      // cheerio node type 8 = comment
      if ((this as any).type === "comment") {
        $(this).remove();
      }
    });

  // Find main content container
  const selector =
    $("main").length > 0
      ? "main"
      : $("article").length > 0
        ? "article"
        : $("body").length > 0
          ? "body"
          : null;

  // Get the HTML of the content root, then process it through a fresh cheerio instance
  // This avoids TypeScript errors from mutating $("body") which can be Cheerio<Document>
  const contentHtml = selector ? $(selector).html() || "" : $.html();

  const $$ = load(`<div>${contentHtml}</div>`, { xml: { decodeEntities: false } }, false);
  const $root = $$("div");

  // Replace <br> with newline marker
  $root.find("br").replaceWith("\n");

  // Block-level tags → surround with double newlines
  const blockTags = [
    "p", "h1", "h2", "h3", "h4", "h5", "h6",
    "section", "article", "blockquote", "pre", "hr",
    "figure", "figcaption", "table", "dl", "div",
    "main", "ul", "ol", "form", "fieldset",
  ];

  // Line-break tags → surround with single newlines
  const lineBreakTags = ["li", "tr", "dt", "dd"];

  for (const tag of blockTags) {
    $root.find(tag).each(function () {
      $$(this).before("\n\n").after("\n\n");
    });
  }

  for (const tag of lineBreakTags) {
    $root.find(tag).each(function () {
      $$(this).before("\n").after("\n");
    });
  }

  // Extract text — cheerio .text() strips all remaining tags
  let text = $root.text();

  // Decode HTML entities with `he` for full spec compliance
  text = he.decode(text);

  // Clean up whitespace
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .replace(/\n[ \t]*\n[ \t]*\n/g, "\n\n")
    .trim();

  return text;
}

/**
 * Decode HTML entities in a plain-text string.
 * Using `he` instead of a custom regex chain avoids CodeQL alerts:
 * - "Replacement of a substring with itself"
 * - "Incomplete multi-character sanitization"
 */
export function decodeHtmlEntities(text: string): string {
  return he.decode(text);
}