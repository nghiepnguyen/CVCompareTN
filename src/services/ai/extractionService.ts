import { getGeminiClient, GEMINI_MODEL } from "./geminiProvider";

export async function extractTextFromImage(
  imageData: string,
  mimeType: string
): Promise<string> {
  const client = await getGeminiClient();

  try {
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Hãy trích xuất toàn bộ văn bản từ hình ảnh này một cách chính xác nhất.",
            },
            {
              inlineData: {
                data: imageData.split(",")[1] || imageData,
                mimeType,
              },
            },
          ],
        },
      ],
    });
    return response.text || "";
  } catch (error) {
    console.error("Lỗi trích xuất ảnh:", error);
    throw new Error("Không thể trích xuất văn bản từ hình ảnh.");
  }
}

/**
 * Fetch a JD page via a CORS proxy service.
 * The proxy fetches the URL and returns the raw content,
 * bypassing the same-origin restriction in the browser.
 * Returns the HTML text on success, or null if the proxy fails.
 */
async function tryCorsProxy(url: string): Promise<string | null> {
  // Public CORS proxies in priority order
  const proxies = [
    (targetUrl: string) =>
      `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    (targetUrl: string) =>
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
    (targetUrl: string) =>
      `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
  ];

  for (const proxyFn of proxies) {
    try {
      const proxyUrl = proxyFn(url);
      const response = await fetch(proxyUrl);
      if (!response.ok) continue;
      const text = await response.text();
      if (text.trim()) return text;
    } catch {
      // Try next proxy
      continue;
    }
  }

  return null;
}

function extractTextFromHtml(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");
  text = text.replace(/<!--[\s\S]*?-->/g, "");

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

export async function extractJDFromUrl(url: string): Promise<string> {
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  // === Strategy 1: Backend scrape (Vercel serverless or Express) ===
  const backendEndpoint = isLocal
    ? "/api/scrape-url/extract"
    : "/api/scrape-url";

  try {
    const response = await fetch(backendEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const data = (await response.json()) as { text?: string; error?: string };

    if (response.ok && data.text?.trim()) {
      return data.text;
    }
  } catch {
    // Backend unreachable — try fallback strategies below
    console.warn("Backend scrape unavailable, trying client-side fallbacks...");
  }

  // === Strategy 2: Client-side CORS proxy ===
  try {
    const html = await tryCorsProxy(url);
    if (html) {
      const text = extractTextFromHtml(html);
      if (text.trim()) return text;
    }
  } catch {
    console.warn("CORS proxy fallback failed, trying Gemini...");
  }

  // === Strategy 3: Gemini via the user's browser (last resort) ===
  // Note: Gemini cannot browse URLs — it will attempt to give what it knows
  // about the URL/company from training data. This is better than nothing.
  try {
    const client = await getGeminiClient();
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Dưới đây là một số thông tin về công việc từ URL tuyển dụng. Hãy trích xuất và tóm tắt toàn bộ nội dung mô tả công việc, yêu cầu, và các thông tin liên quan mà bạn biết về vị trí này từ dữ liệu huấn luyện của bạn. URL: ${url}`,
            },
          ],
        },
      ],
    });
    const text = response.text?.trim();
    if (text) return text;
  } catch {
    console.warn("Gemini fallback failed.");
  }

  throw new Error(
    "Không thể trích xuất nội dung từ liên kết này. Vui lòng sao chép nội dung JD và dán vào ô văn bản."
  );
}