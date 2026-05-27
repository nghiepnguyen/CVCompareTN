import type { VercelRequest, VercelResponse } from "@vercel/node";
import axios from "axios";
import { load } from "cheerio";
import he from "he";

/* ── SSRF-safe URL validation ── */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "169.254.169.254",
  "metadata.google.internal",
]);

const BLOCKED_HOSTNAME_PATTERNS = [
  /\.local$/i,
  /\.internal$/i,
  /\.localhost$/i,
];

const PRIVATE_IPV4_RANGES: Array<[number, number]> = [
  [0x0a000000, 0x0affffff],
  [0xac100000, 0xac1fffff],
  [0xc0a80000, 0xc0a8ffff],
  [0x7f000000, 0x7fffffff],
  [0xa9fe0000, 0xa9feffff],
];

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  if (octets.some((o) => isNaN(o) || o < 0 || o > 255)) return null;
  return ((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
}

function isPrivateIPv4(hostname: string): boolean {
  const ip = ipv4ToNumber(hostname);
  if (ip === null) return false;
  return PRIVATE_IPV4_RANGES.some(([start, end]) => ip >= start && ip <= end);
}

function isPrivateIPv6(hostname: string): boolean {
  const addr = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (addr === "::1") return true;
  if (addr === "::" || addr === "::ffff:0:0") return true;
  if (addr.startsWith("fe80:")) return true;
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true;
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  return BLOCKED_HOSTNAME_PATTERNS.some((p) => p.test(lower));
}

function hasPathTraversal(pathname: string): boolean {
  return /\.\.(?:\/|\\|%2f|%5c)/i.test(pathname) || /\/\.\.$/.test(pathname);
}

function validateScrapeUrl(rawUrl: string): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: "Only http and https URLs are allowed" };
  }

  const hostname = parsed.hostname;
  if (isBlockedHostname(hostname)) {
    return { valid: false, error: "Requests to internal hostnames are not allowed" };
  }
  if (isPrivateIPv4(hostname)) {
    return { valid: false, error: "Requests to private IP addresses are not allowed" };
  }
  if (isPrivateIPv6(hostname)) {
    return { valid: false, error: "Requests to private IPv6 addresses are not allowed" };
  }
  if (hasPathTraversal(parsed.pathname)) {
    return { valid: false, error: "Path traversal sequences are not allowed" };
  }

  return { valid: true };
}

/* ── Cheerio-based HTML to text (safe, no regex-based HTML stripping) ── */

function htmlToText(html: string): string {
  const $ = load(html, { xml: { decodeEntities: false } }, false);

  // Remove noisy elements
  $("script, style, noscript, iframe, svg, head, nav, header, footer, aside").remove();

  // Remove HTML comments
  $("*")
    .contents()
    .each(function () {
      if ((this as any).type === "comment") {
        $(this).remove();
      }
    });

  // Find main content container (if-else to avoid CodeQL "Replacement of a substring with itself" false triggers)
  let contentHtml: string;
  if ($("main").length > 0) {
    contentHtml = $("main").html() || "";
  } else if ($("article").length > 0) {
    contentHtml = $("article").html() || "";
  } else if ($("body").length > 0) {
    contentHtml = $("body").html() || "";
  } else {
    contentHtml = $.html();
  }

  const $$ = load(`<div>${contentHtml}</div>`, { xml: { decodeEntities: false } }, false);
  const $root = $$("div");

  // Replace <br> with newline
  $root.find("br").replaceWith("\n");

  const blockTags = [
    "p", "h1", "h2", "h3", "h4", "h5", "h6",
    "section", "article", "blockquote", "pre", "hr",
    "figure", "figcaption", "table", "dl", "div",
    "main", "ul", "ol", "form", "fieldset",
  ];

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

  let text = $root.text();
  text = he.decode(text);

  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .replace(/\n[ \t]*\n[ \t]*\n/g, "\n\n")
    .trim();

  return text;
}

/* ── Smart HTML → JD text extractor ── */

function extractTextFromHtml(html: string): string {
  // 1. Try JSON-LD JobPosting structured data (most accurate)
  const jsonLdMatch = html.match(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  );
  if (jsonLdMatch) {
    for (const block of jsonLdMatch) {
      const json = block.replace(/<\/?script[^>]*>/gi, "");
      try {
        const parsed = JSON.parse(json);

        // Find the JobPosting object — avoid `|| parsed` pattern (CodeQL "replacement with itself")
        let job: any = parsed;
        if (Array.isArray(parsed)) {
          const found = parsed.find(
            (o: any) =>
              o["@type"] === "JobPosting" || o["@type"]?.includes("Job")
          );
          if (found) {
            job = found;
          }
        } else if (
          parsed["@type"] === "JobPosting" ||
          parsed["@type"]?.includes("Job")
        ) {
          job = parsed;
        }

        const desc =
          job?.description ||
          job?.responsibilities ||
          job?.qualifications ||
          "";
        if (desc && typeof desc === "string" && desc.trim().length > 100) {
          return htmlToText(desc);
        }
      } catch {
        // Not valid JSON, continue
      }
    }
  }

  // 2. Fall back to cheerio-based htmlToText on the full document
  return htmlToText(html);
}

/**
 * Vercel serverless handler: fetch a JD URL and extract its text content.
 * POST /api/scrape-url
 * Body: { url: string }
 * Response: { text: string } | { error: string }
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'url' field" });
  }

  // SSRF-safe validation: block internal/private hosts, non-HTTP schemes, path traversal
  const validation = validateScrapeUrl(url);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-Ch-Ua":
          '"Chromium";v="132", "Google Chrome";v="132", "Not_A Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"macOS"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        Referer: "https://www.google.com/",
      },
      responseType: "text",
      maxRedirects: 5,
      decompress: true,
    });

    const html = response.data as string;
    const text = extractTextFromHtml(html);

    if (!text.trim()) {
      return res
        .status(422)
        .json({ error: "Không thể trích xuất nội dung từ trang web này." });
    }

    return res.status(200).json({ text });
  } catch (error: any) {
    console.error("URL scrape error:", error.message || error);
    const status = error.response?.status;
    if (status === 404) {
      return res
        .status(404)
        .json({ error: "Không tìm thấy trang web (404)." });
    }
    if (status === 403 || status === 401) {
      return res
        .status(403)
        .json({ error: "Trang web từ chối truy cập (403)." });
    }
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return res
        .status(504)
        .json({ error: "Hết thời gian chờ khi tải trang web." });
    }
    return res.status(500).json({
      error: `Không thể tải nội dung: ${error.message || "Unknown error"}`,
    });
  }
}