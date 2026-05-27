import { Router } from "express";
import axios from "axios";
import { validateScrapeUrl } from "../lib/urlValidator.js";
import { htmlToText } from "../lib/htmlToText.js";

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

export default router;