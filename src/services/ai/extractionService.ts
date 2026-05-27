import { getGeminiClient, GEMINI_MODEL } from "./geminiProvider";

export async function extractTextFromImage(imageData: string, mimeType: string): Promise<string> {
  const client = await getGeminiClient();
  
  try {
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{
        role: 'user',
        parts: [
          { text: "Hãy trích xuất toàn bộ văn bản từ hình ảnh này một cách chính xác nhất." },
          { inlineData: { data: imageData.split(",")[1] || imageData, mimeType } }
        ]
      }]
    });
    return response.text || "";
  } catch (error) {
    console.error("Lỗi trích xuất ảnh:", error);
    throw new Error("Không thể trích xuất văn bản từ hình ảnh.");
  }
}

export async function extractJDFromUrl(url: string): Promise<string> {
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  // On Vercel (production): /api/scrape-url
  // On Express (local dev): /api/scrape-url/extract
  const endpoint = isLocal
    ? "/api/scrape-url/extract"
    : "/api/scrape-url";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const data = (await response.json()) as { text?: string; error?: string };

    if (!response.ok || data.error) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    if (!data.text?.trim()) {
      throw new Error("Không thể trích xuất nội dung từ liên kết này.");
    }

    return data.text;
  } catch (error: any) {
    console.error("Lỗi trích xuất URL:", error);
    throw new Error(
      error?.message || "Không thể trích xuất nội dung từ liên kết này."
    );
  }
}
