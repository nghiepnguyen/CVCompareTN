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

function extractTextFromHtml(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  const blockTags = [
    "div", "p", "br", "h1", "h2", "h3", "h4", "h5", "h6",
    "li", "tr", "section", "article", "header", "footer", "main",
    "nav", "aside", "blockquote", "pre", "hr", "table", "tbody",
    "thead", "tfoot", "ul", "ol", "dl", "dt", "dd", "figcaption", "figure",
  ];
  const blockTagRegex = new RegExp(
    `<\\/?(?:${blockTags.join("|")})[^>]*>`,
    "gi"
  );
  text = text.replace(blockTagRegex, "\n");
  text = text.replace(/<[^>]+>/g, "");

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

  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/^\s+|\s+$/gm, "");
  text = text.replace(/\n +/g, "\n");
  text = text.trim();

  return text;
}