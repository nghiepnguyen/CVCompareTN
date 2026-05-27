import { Router } from "express";
import axios from "axios";

const router = Router();

/**
 * Express route: fetch a JD URL and extract its text content.
 * POST /api/scrape-url/extract
 * Body: { url: string }
 */
router.post("/extract", async (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'url' field" });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL format" });
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
      return res.status(422).json({
        error: "Không thể trích xuất nội dung từ trang web này.",
      });
    }

    res.json({ text });
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
    res.status(500).json({
      error: `Không thể tải nội dung: ${error.message || "Unknown error"}`,
    });
  }
});

/* ── HTML Entity Decoder ── */
const HTML_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  "#x2F": "/",
};

function decodeHTMLEntities(s: string): string {
  return s
    .replace(/&([a-z]+);/gi, (_m: string, name: string) => {
      return HTML_ENTITIES[name.toLowerCase()] || _m;
    })
    .replace(/&#(\d+);/g, (_m: string, n: string) =>
      String.fromCharCode(parseInt(n, 10))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_m: string, h: string) =>
      String.fromCharCode(parseInt(h, 16))
    );
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
        const job =
          (Array.isArray(parsed)
            ? parsed.find(
                (o: any) =>
                  o["@type"] === "JobPosting" || o["@type"]?.includes("Job")
              )
            : parsed["@type"] === "JobPosting" ||
                parsed["@type"]?.includes("Job")
              ? parsed
              : null) || parsed;
        const desc =
          job?.description ||
          job?.responsibilities ||
          job?.qualifications ||
          "";
        if (desc && typeof desc === "string" && desc.trim().length > 100) {
          return stripHtmlTags(desc);
        }
      } catch {
        // Not valid JSON, continue
      }
    }
  }

  // 2. Try to isolate main content area
  let body = html;

  // Remove <head> entirely
  body = body.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "");

  // Try to find <main>, <article>, or common JD container
  const mainMatch =
    body.match(/<main[^>]*>([\s\S]*?)<\/main>/gi) ||
    body.match(/<article[^>]*>([\s\S]*?)<\/article>/gi) ||
    body.match(
      /<(?:div|section)[^>]*(?:class|id)="[^"]*(?:job|jd|description|detail|content|post)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|section)>/gi
    );

  if (mainMatch) {
    body = mainMatch.join("\n---\n");
  }

  // 3. Strip noise elements (nav, header, footer, sidebar, ads)
  const noiseTags = [
    "nav",
    "header",
    "footer",
    "aside",
    "noscript",
    "iframe",
    "svg",
  ];
  for (const tag of noiseTags) {
    body = body.replace(
      new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"),
      ""
    );
  }
  body = body.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  body = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  body = body.replace(/<!--[\s\S]*?-->/g, "");

  // 4. Convert HTML to structured text
  return stripHtmlTags(body);
}

function stripHtmlTags(html: string): string {
  let text = html;

  // Paragraph-level: double newline
  const paragraphTags = [
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "section",
    "article",
    "blockquote",
    "pre",
    "hr",
    "figure",
    "figcaption",
    "table",
    "dl",
  ];
  for (const tag of paragraphTags) {
    text = text.replace(new RegExp(`<\\/${tag}[^>]*>`, "gi"), "\n\n");
    text = text.replace(new RegExp(`<${tag}[^>]*>`, "gi"), "\n\n");
  }

  // Line-break level: single newline
  const lineBreakTags = [
    "br",
    "li",
    "tr",
    "dt",
    "dd",
    "div",
    "main",
    "header",
    "footer",
    "nav",
    "aside",
    "ul",
    "ol",
    "tbody",
    "thead",
    "tfoot",
  ];
  for (const tag of lineBreakTags) {
    text = text.replace(new RegExp(`<\\/${tag}[^>]*>`, "gi"), "\n");
    text = text.replace(new RegExp(`<${tag}[^>]*>`, "gi"), "\n");
  }

  // Remove remaining tags (inline: span, a, strong, etc.)
  text = text.replace(/<[^>]+>/g, "");

  // Decode entities
  text = decodeHTMLEntities(text);

  // Clean up whitespace — preserve paragraph breaks
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/^[ \t]+|[ \t]+$/gm, "");
  text = text.replace(/\n[ \t]*\n[ \t]*\n/g, "\n\n");

  return text.trim();
}

export default router;