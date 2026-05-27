import type { VercelRequest, VercelResponse } from "@vercel/node";
import axios from "axios";

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

  // Basic URL validation
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL format" });
  }

  try {
    // Fetch the page HTML
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CVCompare/1.0; +https://thanhnghiep.top)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
      },
      responseType: "text",
      maxRedirects: 5,
    });

    const html = response.data as string;

    // Extract meaningful text from HTML
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
    return res
      .status(500)
      .json({ error: `Không thể tải nội dung: ${error.message || "Unknown error"}` });
  }
}

/**
 * Extract human-readable text from raw HTML.
 * Removes scripts, styles, HTML tags, and collapses whitespace.
 */
function extractTextFromHtml(html: string): string {
  // Remove script and style elements with their content
  let text = html.replace(
    /<script[^>]*>[\s\S]*?<\/script>/gi,
    ""
  );
  text = text.replace(
    /<style[^>]*>[\s\S]*?<\/style>/gi,
    ""
  );
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // Replace common block elements with newlines to preserve structure
  const blockTags = [
    "div",
    "p",
    "br",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "tr",
    "section",
    "article",
    "header",
    "footer",
    "main",
    "nav",
    "aside",
    "blockquote",
    "pre",
    "hr",
    "table",
    "tbody",
    "thead",
    "tfoot",
    "ul",
    "ol",
    "dl",
    "dt",
    "dd",
    "figcaption",
    "figure",
  ];
  const blockTagRegex = new RegExp(
    `<\\/?(?:${blockTags.join("|")})[^>]*>`,
    "gi"
  );
  text = text.replace(blockTagRegex, "\n");

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/'/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));

  // Collapse multiple whitespace/newlines
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/^\s+|\s+$/gm, "");
  text = text.replace(/\n +/g, "\n");
  text = text.trim();

  return text;
}